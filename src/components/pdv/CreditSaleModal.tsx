import { useEffect, useState } from 'react'
import { ApiError } from '../../lib/api'
import { checkCreditSale, creditDueDates, fetchCreditUsage, splitInstallments, type CreditUsage } from '../../lib/credit'
import { formatCurrency } from '../../lib/format'
import { searchAnyPeople, type PersonRecord } from '../../lib/people'
import { CloseIcon, SearchIcon } from '../icons'

export interface CreditSaleChoice {
  installments: number
  firstDue: string
  password: string
}

interface Props {
  token: string
  companyId: string
  amount: number
  client: PersonRecord | null
  passwordRequired: boolean
  onPickClient: (person: PersonRecord | null) => void
  onClose: () => void
  onConfirm: (choice: CreditSaleChoice) => void
}

const plusDays = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const formatDay = (iso: string) => iso.split('-').reverse().join('/')

// Venda no crediário: cliente identificado, limite disponível, parcelas e (se ativo) senha do administrador.
export function CreditSaleModal({ token, companyId, amount, client, passwordRequired, onPickClient, onClose, onConfirm }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PersonRecord[]>([])
  const [usage, setUsage] = useState<CreditUsage | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [installments, setInstallments] = useState(1)
  const [firstDue, setFirstDue] = useState(plusDays(30))
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!client) return
    setLoadingUsage(true)
    setUsage(null)
    fetchCreditUsage(token, companyId, client.id)
      .then(setUsage)
      .catch(() => setUsage(null))
      .finally(() => setLoadingUsage(false))
  }, [client, token, companyId])

  useEffect(() => {
    if (client || query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      searchAnyPeople(token, companyId, query.trim())
        .then(setResults)
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [query, client, token, companyId])

  const values = splitInstallments(amount, installments)
  const dates = creditDueDates(firstDue, installments)
  const overLimit = usage ? amount > usage.available + 0.004 : false
  const noLimit = usage ? usage.limit <= 0 : false

  async function confirm() {
    if (!client) return setError('Escolha o cliente.')
    if (passwordRequired && !password) return setError('Digite a senha do crediário.')
    setChecking(true)
    setError(null)
    try {
      await checkCreditSale(token, companyId, { peopleId: client.id, amount, password: password || undefined })
      onConfirm({ installments, firstDue, password })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível conferir o crediário agora.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
    >
      <div
        className="flex max-h-[94svh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-[12px] font-semibold text-[var(--muted)]">Venda no crediário</p>
            <p className="text-[22px] font-bold text-[var(--ink)]">{formatCurrency(amount)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--page)]">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-1.5 text-[12px] font-semibold text-[var(--ink-soft)]">Cliente</p>
          {client ? (
            <div className="rounded-xl border border-[var(--border)] p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14px] font-bold text-[var(--ink)]">{client.name}</p>
                <button type="button" onClick={() => onPickClient(null)} className="text-[12px] font-semibold text-[var(--blue-700)]">
                  Trocar
                </button>
              </div>
              {loadingUsage ? (
                <p className="mt-2 text-[12.5px] text-[var(--muted)]">Consultando o limite…</p>
              ) : usage ? (
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-[var(--page)] px-2 py-1.5">
                    <p className="text-[10.5px] font-semibold text-[var(--muted)]">Limite</p>
                    <p className="text-[13px] font-bold text-[var(--ink)]">{formatCurrency(usage.limit)}</p>
                  </div>
                  <div className="rounded-lg bg-[var(--page)] px-2 py-1.5">
                    <p className="text-[10.5px] font-semibold text-[var(--muted)]">Em aberto</p>
                    <p className="text-[13px] font-bold text-[var(--ink)]">{formatCurrency(usage.used)}</p>
                  </div>
                  <div className={`rounded-lg px-2 py-1.5 ${overLimit || noLimit ? 'bg-[var(--red-100)]' : 'bg-[var(--green-100)]'}`}>
                    <p className="text-[10.5px] font-semibold text-[var(--muted)]">Disponível</p>
                    <p className={`text-[13px] font-bold ${overLimit || noLimit ? 'text-[var(--red-500)]' : 'text-[var(--green-600)]'}`}>
                      {formatCurrency(usage.available)}
                    </p>
                  </div>
                </div>
              ) : null}
              {usage && usage.overdue_count > 0 && (
                <p className="mt-2 rounded-lg bg-[var(--amber-100)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--amber-500)]">
                  ⚠ {usage.overdue_count} parcela(s) em atraso: {formatCurrency(usage.overdue)}
                </p>
              )}
              {noLimit && <p className="mt-2 text-[12px] font-semibold text-[var(--red-500)]">Cliente sem limite de crédito no cadastro.</p>}
              {!noLimit && overLimit && <p className="mt-2 text-[12px] font-semibold text-[var(--red-500)]">Valor acima do limite disponível.</p>}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-[var(--page)] px-3.5 py-2.5 ring-1 ring-transparent focus-within:ring-[var(--blue-300)]">
                <SearchIcon className="h-4 w-4 flex-none text-[var(--muted)]" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nome, razão social, CPF/CNPJ, telefone ou código"
                  className="w-full bg-transparent text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
                />
              </div>
              {results.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[var(--border)]">
                  {results.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => onPickClient(person)}
                      className="block w-full border-b border-[var(--border)] px-3.5 py-2.5 text-left text-[13.5px] font-semibold text-[var(--ink)] last:border-0 hover:bg-[var(--blue-100)]"
                    >
                      {person.name}
                      {person.document && (
                        <span className="ml-2 text-[12px] font-normal text-[var(--muted)]">
                          {person.document}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Parcelas</span>
              <select
                value={installments}
                onChange={(event) => setInstallments(Number(event.target.value))}
                className="rounded-xl border border-[var(--border)] bg-[var(--page)] px-3 py-2.5 text-[14px] text-[var(--ink)]"
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {count}x de {formatCurrency(splitInstallments(amount, count)[count - 1])}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-[var(--ink-soft)]">1º vencimento</span>
              <input
                type="date"
                value={firstDue}
                onChange={(event) => event.target.value && setFirstDue(event.target.value)}
                className="rounded-xl border border-[var(--border)] bg-[var(--page)] px-3 py-2.5 text-[14px] text-[var(--ink)]"
              />
            </label>
          </div>

          <div className="mt-3 rounded-xl bg-[var(--page)] px-3.5 py-2.5">
            {dates.map((date, index) => (
              <div key={date + index} className="flex justify-between py-0.5 text-[12.5px] text-[var(--ink-soft)]">
                <span>
                  Parcela {index + 1}/{installments} · vence {formatDay(date)}
                </span>
                <span className="font-semibold text-[var(--ink)]">{formatCurrency(values[index])}</span>
              </div>
            ))}
          </div>

          {passwordRequired && (
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Senha do crediário (administrador)</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void confirm()}
                className="rounded-xl border border-[var(--border)] bg-[var(--page)] px-3.5 py-2.5 text-[15px] tracking-widest text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-300)]"
              />
            </label>
          )}

          {error && <p className="mt-3 rounded-lg bg-[var(--red-100)] px-3 py-2 text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-[var(--border)] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--border)] py-3 text-[13.5px] font-semibold text-[var(--ink-soft)]">
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!client || checking || overLimit || noLimit}
            className="flex-1 rounded-xl bg-[var(--blue-500)] py-3 text-[14px] font-bold text-white hover:bg-[var(--blue-700)] disabled:opacity-45"
          >
            {checking ? 'Conferindo…' : `Lançar ${installments}x no crediário`}
          </button>
        </div>
      </div>
    </div>
  )
}
