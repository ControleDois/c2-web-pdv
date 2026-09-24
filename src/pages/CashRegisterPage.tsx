import { useEffect, useState } from 'react'
import {
  fetchCashRegisterStatus,
  fetchCashRegisterMovements,
  openCashRegister,
  closeCashRegister,
  FORM_PAYMENT_LABELS,
  type CashRegisterStatus,
  type CashRegisterMovementSummary,
} from '../lib/cashRegister'
import { fetchPeopleByRole, type PersonRecord } from '../lib/people'
import { useMyCompanyPerson } from '../hooks/useMyCompanyPerson'
import { ApiError } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { WalletIcon, LockIcon, CheckCircleIcon } from '../components/icons'
import type { AuthSession, AuthCompany } from '../lib/auth'

interface CashRegisterPageProps {
  session: AuthSession
  company: AuthCompany
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function AmountInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.01"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-right text-[13.5px] font-semibold text-[var(--ink)] outline-none focus:border-[var(--blue-500)]"
    />
  )
}

// Tela de abertura/fechamento de caixa do PDV - o backend (CashRegisterService)
// já existia, mas não tinha nenhuma tela em lugar nenhum pra usar essa API;
// o PDV só consultava o status pra bloquear a venda rápida. Fluxo aqui é
// idêntico ao que o backend espera: gerente (role 6) + operador (role 7)
// confirmam com a própria senha de login pra abrir, e a mesma dupla confirma
// de novo (só senha, sem escolher de novo) pra fechar com a conferência.
export function CashRegisterPage({ session, company }: CashRegisterPageProps) {
  const token = session.token.token
  const myPerson = useMyCompanyPerson(session, company)

  const [status, setStatus] = useState<CashRegisterStatus | null>(null)
  const [movements, setMovements] = useState<CashRegisterMovementSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'open' | 'close'>('view')

  const [managers, setManagers] = useState<PersonRecord[]>([])
  const [operators, setOperators] = useState<PersonRecord[]>([])

  const [managerId, setManagerId] = useState('')
  const [managerPassword, setManagerPassword] = useState('')
  const [operatorId, setOperatorId] = useState('')
  const [operatorPassword, setOperatorPassword] = useState('')
  const [openingAmount, setOpeningAmount] = useState('0')
  const [note, setNote] = useState('')
  const [closingPayments, setClosingPayments] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    fetchCashRegisterStatus(token, company.id)
      .then((res) => {
        setStatus(res)
        if (res.session?.id) {
          return fetchCashRegisterMovements(token, res.session.id).then((details) => setMovements(details.movements))
        }
        setMovements(null)
        return undefined
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o caixa.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, company.id])

  function startOpen() {
    setFormError(null)
    setManagerId('')
    setManagerPassword('')
    setOperatorId(myPerson?.id ?? '')
    setOperatorPassword('')
    setOpeningAmount('0')
    setNote('')
    setMode('open')
    if (!managers.length) {
      fetchPeopleByRole(token, company.id, 6).then(setManagers).catch(() => undefined)
    }
    if (!operators.length) {
      fetchPeopleByRole(token, company.id, 7).then(setOperators).catch(() => undefined)
    }
  }

  function startClose() {
    setFormError(null)
    setManagerPassword('')
    setOperatorPassword('')
    setNote('')
    const accepted = status?.acceptedPaymentMethods ?? []
    const byPayment = new Map((movements?.byPayment ?? []).map((item) => [item.formPayment, item.amount]))
    const initial: Record<number, string> = {}
    for (const method of accepted) {
      const suggested = byPayment.get(method) ?? 0
      initial[method] = suggested > 0 ? suggested.toFixed(2) : ''
    }
    setClosingPayments(initial)
    setMode('close')
  }

  async function handleOpenSubmit() {
    if (!managerId || !managerPassword || !operatorId || !operatorPassword) {
      setFormError('Preencha gerente, operador e as duas senhas.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await openCashRegister(token, {
        companyId: company.id,
        managerPeopleId: managerId,
        managerPassword,
        operatorPeopleId: operatorId,
        operatorPassword,
        openingAmount: Number(openingAmount) || 0,
        note: note || undefined,
      })
      setMode('view')
      load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível abrir o caixa.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCloseSubmit() {
    if (!status?.session?.id) return
    if (!managerPassword || !operatorPassword) {
      setFormError('Informe a senha do gerente e do operador.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await closeCashRegister(token, status.session.id, {
        managerPassword,
        operatorPassword,
        closingPayments: Object.entries(closingPayments)
          .map(([formPayment, amount]) => ({ formPayment: Number(formPayment), amount: Number(amount) || 0 }))
          .filter((item) => item.amount !== 0),
        note: note || undefined,
      })
      setMode('view')
      load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível fechar o caixa.')
    } finally {
      setSaving(false)
    }
  }

  const declaredTotal = Object.values(closingPayments).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const expectedTotal = movements?.total ?? 0

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[var(--blue-100)] text-[var(--blue-700)]">
          <WalletIcon className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-[18px] font-bold text-[var(--ink)]">Caixa</h1>
          <p className="text-[12.5px] text-[var(--ink-soft)]">Abertura, fechamento e conferência do caixa do operador</p>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-500)]">
          {error}
        </p>
      )}

      {loading && !status ? (
        <div className="h-32 animate-pulse rounded-2xl bg-[var(--surface)]" />
      ) : status && !status.enabled ? (
        <div className="max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
          <p className="text-[13.5px] font-bold text-[var(--ink)]">Controle de caixa desativado</p>
          <p className="mt-1 text-[12px] text-[var(--ink-soft)]">
            Ative em Configurações → Caixa (administrativo) pra exigir abertura/fechamento antes das vendas.
          </p>
        </div>
      ) : mode === 'open' ? (
        <div className="flex max-w-lg flex-col gap-3.5">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-[12.5px] font-bold text-[var(--ink)]">Gerente</p>
            <select
              value={managerId}
              onChange={(event) => setManagerId(event.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--blue-500)]"
            >
              <option value="">Selecione…</option>
              {managers.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <input
              type="password"
              placeholder="Senha do gerente"
              value={managerPassword}
              onChange={(event) => setManagerPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--blue-500)]"
            />
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-[12.5px] font-bold text-[var(--ink)]">Operador</p>
            <select
              value={operatorId}
              onChange={(event) => setOperatorId(event.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--blue-500)]"
            >
              <option value="">Selecione…</option>
              {operators.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <input
              type="password"
              placeholder="Senha do operador"
              value={operatorPassword}
              onChange={(event) => setOperatorPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--blue-500)]"
            />
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-[12.5px] font-bold text-[var(--ink)]">Valor inicial (troco)</p>
            <AmountInput value={openingAmount} onChange={setOpeningAmount} />
            <textarea
              placeholder="Observação (opcional)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--blue-500)]"
            />
          </div>

          {formError && (
            <p className="rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-500)]">
              {formError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('view')}
              className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-bold text-[var(--ink-soft)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleOpenSubmit}
              disabled={saving}
              className="flex-1 rounded-xl bg-[var(--blue-500)] py-2.5 text-[13px] font-bold text-white hover:bg-[var(--blue-700)] disabled:opacity-60"
            >
              {saving ? 'Abrindo…' : 'Abrir caixa'}
            </button>
          </div>
        </div>
      ) : mode === 'close' && status?.session ? (
        <div className="flex max-w-lg flex-col gap-3.5">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-[var(--ink-soft)]">Total esperado (vendas do caixa)</span>
              <span className="font-bold text-[var(--ink)]">{formatCurrency(expectedTotal)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[12.5px]">
              <span className="text-[var(--ink-soft)]">Total conferido</span>
              <span className="font-bold text-[var(--ink)]">{formatCurrency(declaredTotal)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[12.5px]">
              <span className="text-[var(--ink-soft)]">Diferença</span>
              <span className={`font-bold ${declaredTotal - expectedTotal === 0 ? 'text-[var(--ink)]' : declaredTotal - expectedTotal > 0 ? 'text-[var(--green-600)]' : 'text-[var(--red-500)]'}`}>
                {formatCurrency(declaredTotal - expectedTotal)}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2.5 text-[12.5px] font-bold text-[var(--ink)]">Conferência por forma de pagamento</p>
            <div className="flex flex-col gap-2">
              {(status.acceptedPaymentMethods ?? []).map((method) => (
                <div key={method} className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] text-[var(--ink-soft)]">{FORM_PAYMENT_LABELS[method] ?? `Forma ${method}`}</span>
                  <div className="w-28">
                    <AmountInput
                      value={closingPayments[method] ?? ''}
                      onChange={(value) => setClosingPayments((current) => ({ ...current, [method]: value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <input
              type="password"
              placeholder="Senha do gerente"
              value={managerPassword}
              onChange={(event) => setManagerPassword(event.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--blue-500)]"
            />
            <input
              type="password"
              placeholder="Senha do operador"
              value={operatorPassword}
              onChange={(event) => setOperatorPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--blue-500)]"
            />
            <textarea
              placeholder="Observação (opcional)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--blue-500)]"
            />
          </div>

          {formError && (
            <p className="rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-500)]">
              {formError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('view')}
              className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-bold text-[var(--ink-soft)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCloseSubmit}
              disabled={saving}
              className="flex-1 rounded-xl bg-[var(--red-500)] py-2.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? 'Fechando…' : 'Fechar caixa'}
            </button>
          </div>
        </div>
      ) : status?.session ? (
        <div className="max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--green-100)] text-[var(--green-600)]">
              <CheckCircleIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13.5px] font-bold text-[var(--ink)]">Caixa aberto</p>
              <p className="text-[11.5px] text-[var(--ink-soft)]">Desde {formatDateTime(status.session.opened_at || status.session.openedAt)}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
            <div>
              <p className="text-[var(--ink-soft)]">Operador</p>
              <p className="font-bold text-[var(--ink)]">{status.session.operator?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-[var(--ink-soft)]">Gerente</p>
              <p className="font-bold text-[var(--ink)]">{status.session.manager?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-[var(--ink-soft)]">Valor inicial</p>
              <p className="font-bold text-[var(--ink)]">{formatCurrency(Number(status.session.opening_amount ?? status.session.openingAmount ?? 0))}</p>
            </div>
            <div>
              <p className="text-[var(--ink-soft)]">Movimentado</p>
              <p className="font-bold text-[var(--ink)]">{formatCurrency(expectedTotal)}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={startClose}
            className="mt-5 w-full rounded-xl bg-[var(--red-500)] py-2.5 text-[13px] font-bold text-white hover:opacity-90"
          >
            Fechar caixa
          </button>
        </div>
      ) : (
        <div className="max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--page)] text-[var(--ink-soft)]">
            <LockIcon className="h-4.5 w-4.5" />
          </span>
          <p className="mt-3 text-[13.5px] font-bold text-[var(--ink)]">Caixa fechado</p>
          <p className="mt-1 text-[12px] text-[var(--ink-soft)]">Abra o caixa informando gerente e operador pra liberar as vendas.</p>
          <button
            type="button"
            onClick={startOpen}
            className="mt-4 w-full rounded-xl bg-[var(--blue-500)] py-2.5 text-[13px] font-bold text-white hover:bg-[var(--blue-700)]"
          >
            Abrir caixa
          </button>
        </div>
      )}
    </div>
  )
}
