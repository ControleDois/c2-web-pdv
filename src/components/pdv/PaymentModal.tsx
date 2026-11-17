import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'
import { formatCurrency } from '../../lib/format'
import { CloseIcon, CreditCardIcon, QrCodeIcon, WalletIcon } from '../icons'
import {
  EMPTY_PAYMENT_DETAILS,
  PaymentDetailsFields,
  isElectronicPayment,
  paymentDetailsPayload,
  type PaymentDetails,
} from './PaymentDetailsFields'

// Tela de cobrança do PDV (mesma da venda rápida): no computador, atalhos N/D/C/P e várias
// formas de pagamento; no celular, toque na forma e pronto (dinheiro pergunta quanto entregou).

export interface PaymentModalLine {
  form_payment: number
  name: string
  // Valor que abate da conta (sem o troco).
  amount: number
  // Dinheiro entregue pelo cliente, quando maior que o valor (troco).
  received?: number
  card_brand?: string
  payment_authorization?: string
  card_acquirer_cnpj?: string
}

export const PDV_PAYMENT_METHODS = [
  { key: 'N', form_payment: 9, name: 'Dinheiro', icon: WalletIcon },
  { key: 'D', form_payment: 2, name: 'Débito', icon: CreditCardIcon },
  { key: 'C', form_payment: 1, name: 'Crédito', icon: CreditCardIcon },
  { key: 'P', form_payment: 10, name: 'PIX', icon: QrCodeIcon },
]

const round2 = (value: number) => Math.round(value * 100) / 100

function parseAmountInput(value: string): number {
  const num = Number(value.replace(/\./g, '').replace(',', '.'))
  return Number.isNaN(num) ? 0 : num
}

const toInput = (value: number) => (value > 0 ? value.toFixed(2).replace('.', ',') : '')

// O que passou do total vira troco (só dinheiro dá troco): as linhas somam exatamente o total.
export function settlePayments(lines: PaymentModalLine[], total: number) {
  let excess = round2(lines.reduce((sum, line) => sum + line.amount, 0) - total)
  const settled = lines.map((line) => ({ ...line }))
  for (let index = settled.length - 1; index >= 0 && excess > 0; index--) {
    const line = settled[index]
    if (line.form_payment !== 9) continue
    const cut = Math.min(excess, line.amount)
    line.received = round2((line.received ?? line.amount))
    line.amount = round2(line.amount - cut)
    excess = round2(excess - cut)
  }
  const kept = settled.filter((line) => line.amount > 0)
  const change = round2(settled.reduce((sum, line) => sum + Math.max(0, (line.received ?? line.amount) - line.amount), 0))
  return { lines: kept, change }
}

interface PaymentModalProps {
  open: boolean
  total: number
  title?: string
  confirmLabel?: string
  submitting?: boolean
  submittingLabel?: string
  error?: string | null
  // Lembra a operadora da maquininha digitada por último (por empresa).
  acquirerStorageKey?: string
  onClose: () => void
  onConfirm: (lines: PaymentModalLine[], change: number) => void
}

export function PaymentModal({
  open,
  total,
  title = 'Total a cobrar',
  confirmLabel = 'Finalizar',
  submitting = false,
  submittingLabel = 'Registrando…',
  error,
  acquirerStorageKey,
  onClose,
  onConfirm,
}: PaymentModalProps) {
  const isMobile = useIsMobile()
  const [payView, setPayView] = useState<'methods' | 'cash' | 'split'>('methods')
  const [payments, setPayments] = useState<PaymentModalLine[]>([])
  const [methodIndex, setMethodIndex] = useState(0)
  const [amountInput, setAmountInput] = useState('')
  const [cashInput, setCashInput] = useState('')
  const [details, setDetails] = useState<PaymentDetails>(EMPTY_PAYMENT_DETAILS)
  const amountRef = useRef<HTMLInputElement>(null)

  const paidTotal = round2(payments.reduce((sum, line) => sum + line.amount, 0))
  const remaining = Math.max(0, round2(total - paidTotal))
  const change = Math.max(0, round2(paidTotal - total))

  useEffect(() => {
    if (!open) return
    setPayView('methods')
    setPayments([])
    setMethodIndex(0)
    setCashInput('')
    setAmountInput(toInput(total))
    let saved = EMPTY_PAYMENT_DETAILS
    try {
      const raw = acquirerStorageKey ? localStorage.getItem(acquirerStorageKey) : null
      if (raw) saved = { ...EMPTY_PAYMENT_DETAILS, ...JSON.parse(raw) }
    } catch {
      // sem armazenamento: começa sem operadora
    }
    setDetails(saved)
    setTimeout(() => {
      amountRef.current?.focus()
      amountRef.current?.select()
    }, 0)
    // Só ao abrir: o total não muda com a tela aberta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const method = PDV_PAYMENT_METHODS[methodIndex]

  function confirm(lines: PaymentModalLine[] = payments) {
    if (submitting || lines.length === 0) return
    const paid = round2(lines.reduce((sum, line) => sum + line.amount, 0))
    if (paid < round2(total)) return
    const settled = settlePayments(lines, total)
    onConfirm(settled.lines, settled.change)
  }

  function addLine() {
    const amount = parseAmountInput(amountInput)
    if (!amount || amount <= 0 || remaining <= 0) return
    // Cartão e PIX não dão troco: passa do que falta, fica só o que falta.
    const value = method.form_payment === 9 ? amount : Math.min(amount, remaining)
    setPayments((prev) => [
      ...prev,
      { form_payment: method.form_payment, name: method.name, amount: round2(value), ...paymentDetailsPayload(method.form_payment, details) },
    ])
    if (isElectronicPayment(method.form_payment) && acquirerStorageKey) {
      try {
        localStorage.setItem(acquirerStorageKey, JSON.stringify({ acquirer: details.acquirer, otherCnpj: details.otherCnpj }))
      } catch {
        // sem armazenamento: só não lembra a operadora
      }
    }
    setDetails((prev) => ({ ...prev, brand: '', authorization: '' }))
    setAmountInput(toInput(Math.max(0, round2(remaining - value))))
    setTimeout(() => amountRef.current?.select(), 0)
  }

  function payFull(index: number, received?: number) {
    const chosen = PDV_PAYMENT_METHODS[index]
    const line: PaymentModalLine = { form_payment: chosen.form_payment, name: chosen.name, amount: round2(total), received }
    setPayments([line])
    confirm([line])
  }

  function cashSuggestions(): number[] {
    const values = new Set<number>()
    for (const note of [5, 10, 20, 50, 100, 200]) {
      const value = Math.ceil(total / note) * note
      if (value > total) values.add(value)
    }
    return [...values].sort((a, b) => a - b).slice(0, 3)
  }

  if (isMobile) {
    const cashValue = parseAmountInput(cashInput)
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={() => !submitting && onClose()}>
        <div
          className="max-h-[94svh] overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--border)]" />
          <div className="text-center">
            <p className="text-[12.5px] font-semibold text-[var(--muted)]">{title}</p>
            <p className="text-[36px] font-bold leading-tight text-[var(--ink)]">{formatCurrency(total)}</p>
            {payView === 'split' && payments.length > 0 && (
              <p className={`text-[13px] font-semibold ${remaining > 0 ? 'text-[var(--red-500)]' : 'text-[var(--green-600)]'}`}>
                {remaining > 0 ? `Falta ${formatCurrency(remaining)}` : change > 0 ? `Troco ${formatCurrency(change)}` : 'Tudo pago'}
              </p>
            )}
          </div>

          {error && <p className="mt-3 rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-500)]">{error}</p>}

          {submitting ? (
            <div className="py-10 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--blue-500)]" />
              <p className="mt-3 text-[14px] font-semibold text-[var(--ink)]">{submittingLabel}</p>
            </div>
          ) : payView === 'methods' ? (
            <>
              <p className="mt-3 text-center text-[13px] font-semibold text-[var(--ink-soft)]">Toque na forma de pagamento para finalizar</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {PDV_PAYMENT_METHODS.map((item, index) => {
                  const MethodIcon = item.icon
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        if (item.key === 'N') {
                          setCashInput('')
                          setPayView('cash')
                        } else {
                          payFull(index)
                        }
                      }}
                      className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border)] text-[15px] font-bold text-[var(--ink)] active:border-[var(--blue-500)] active:bg-[var(--blue-100)]"
                    >
                      <MethodIcon className="h-6 w-6 text-[var(--blue-700)]" />
                      {item.name}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPayments([])
                  setMethodIndex(0)
                  setAmountInput(toInput(total))
                  setPayView('split')
                }}
                className="mt-3 w-full rounded-2xl py-3.5 text-[14px] font-semibold text-[var(--blue-700)] active:bg-[var(--blue-100)]"
              >
                Dividir em mais de uma forma de pagamento
              </button>
              <button type="button" onClick={onClose} className="w-full py-3 text-[14px] font-semibold text-[var(--ink-soft)]">
                Voltar
              </button>
            </>
          ) : payView === 'cash' ? (
            <>
              <p className="mt-3 text-center text-[13px] font-semibold text-[var(--ink-soft)]">Quanto o cliente entregou?</p>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => payFull(0, total)}
                  className="col-span-2 rounded-2xl bg-[var(--blue-500)] py-4 text-[16px] font-bold text-white active:bg-[var(--blue-700)]"
                >
                  Valor exato · {formatCurrency(total)}
                </button>
                {cashSuggestions().map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => payFull(0, value)}
                    className="rounded-2xl border-2 border-[var(--border)] py-3.5 text-[15px] font-bold text-[var(--ink)] active:border-[var(--blue-500)] active:bg-[var(--blue-100)]"
                  >
                    {formatCurrency(value)}
                    <span className="block text-[11.5px] font-semibold text-[var(--muted)]">troco {formatCurrency(value - total)}</span>
                  </button>
                ))}
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={cashInput}
                placeholder="Outro valor"
                enterKeyHint="done"
                onChange={(event) => setCashInput(event.target.value.replace(/[^\d,]/g, ''))}
                className="mt-3 w-full rounded-2xl bg-[var(--page)] px-4 py-3.5 text-center text-[20px] font-bold text-[var(--ink)] focus:outline-none"
              />
              {cashValue >= total && cashValue > 0 && (
                <>
                  <p className="mt-2 text-center text-[14px] font-bold text-[var(--green-600)]">Troco: {formatCurrency(cashValue - total)}</p>
                  <button
                    type="button"
                    onClick={() => payFull(0, cashValue)}
                    className="mt-2 w-full rounded-2xl bg-[var(--blue-500)] py-4 text-[16px] font-bold text-white active:bg-[var(--blue-700)]"
                  >
                    Confirmar recebimento
                  </button>
                </>
              )}
              <button type="button" onClick={() => setPayView('methods')} className="mt-2 w-full py-3 text-[14px] font-semibold text-[var(--ink-soft)]">
                Voltar
              </button>
            </>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {PDV_PAYMENT_METHODS.map((item, index) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMethodIndex(index)}
                    className={`rounded-xl border-2 px-1 py-3 text-[12.5px] font-bold ${
                      index === methodIndex
                        ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
                        : 'border-[var(--border)] text-[var(--ink-soft)]'
                    }`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  ref={amountRef}
                  type="text"
                  inputMode="decimal"
                  value={amountInput}
                  enterKeyHint="done"
                  onChange={(event) => setAmountInput(event.target.value.replace(/[^\d,]/g, ''))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addLine()
                    }
                  }}
                  className="min-w-0 flex-1 rounded-2xl bg-[var(--page)] px-4 py-3.5 text-center text-[20px] font-bold text-[var(--ink)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addLine}
                  disabled={remaining <= 0}
                  className="flex-none rounded-2xl bg-[var(--blue-100)] px-5 text-[14px] font-bold text-[var(--blue-700)] disabled:opacity-45"
                >
                  Adicionar
                </button>
              </div>
              <PaymentDetailsFields formPayment={method.form_payment} value={details} onChange={setDetails} onEnter={addLine} />
              <PaymentList payments={payments} onRemove={(index) => setPayments((prev) => prev.filter((_, i) => i !== index))} large />
              <button
                type="button"
                onClick={() => confirm()}
                disabled={remaining > 0 || payments.length === 0}
                className="mt-3 w-full rounded-2xl bg-[var(--blue-500)] py-4 text-[16px] font-bold text-white active:bg-[var(--blue-700)] disabled:opacity-45"
              >
                {confirmLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayments([])
                  setPayView('methods')
                }}
                className="mt-2 w-full py-3 text-[14px] font-semibold text-[var(--ink-soft)]"
              >
                Voltar
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !submitting && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <p className="mb-3 text-center text-[12.5px] font-semibold text-[var(--muted)]">{title}</p>
        <div className="mb-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[11px] text-[var(--muted)]">Total</p>
            <p className="text-[15px] font-bold text-[var(--ink)]">{formatCurrency(total)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--muted)]">Pago</p>
            <p className="text-[15px] font-bold text-[var(--green-600)]">{formatCurrency(paidTotal)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--muted)]">{change > 0 ? 'Troco' : 'Falta'}</p>
            <p className={`text-[15px] font-bold ${change > 0 ? 'text-[var(--green-600)]' : 'text-[var(--red-500)]'}`}>
              {formatCurrency(change > 0 ? change : remaining)}
            </p>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-4 gap-2">
          {PDV_PAYMENT_METHODS.map((item, index) => {
            const MethodIcon = item.icon
            return (
              <button
                type="button"
                key={item.key}
                onClick={() => {
                  setMethodIndex(index)
                  amountRef.current?.focus()
                }}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11.5px] font-bold transition ${
                  index === methodIndex
                    ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
                    : 'border-[var(--border)] text-[var(--ink-soft)]'
                }`}
              >
                <MethodIcon className="h-4 w-4" />
                <span>
                  {item.key} · {item.name}
                </span>
              </button>
            )
          })}
        </div>

        <input
          ref={amountRef}
          type="text"
          inputMode="decimal"
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value.replace(/[^\d,]/g, ''))}
          onKeyDown={(event) => {
            const key = event.key.toUpperCase()
            const shortcut = PDV_PAYMENT_METHODS.findIndex((item) => item.key === key)
            if (shortcut >= 0) {
              event.preventDefault()
              setMethodIndex(shortcut)
            } else if (event.key === 'ArrowRight') {
              event.preventDefault()
              setMethodIndex((prev) => Math.min(prev + 1, PDV_PAYMENT_METHODS.length - 1))
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault()
              setMethodIndex((prev) => Math.max(prev - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              if (remaining <= 0 && payments.length > 0) confirm()
              else addLine()
            } else if (event.key === 'F4') {
              event.preventDefault()
              confirm()
            } else if (event.key === 'Delete') {
              event.preventDefault()
              setPayments((prev) => prev.slice(0, -1))
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
          className="w-full rounded-xl bg-[var(--page)] px-3.5 py-3 text-center text-[20px] font-bold text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
        />
        <p className="mt-1.5 text-center text-[11px] text-[var(--muted)]">← → troca a forma · Enter adiciona · Delete remove última · F4 confirma</p>
        <PaymentDetailsFields formPayment={method.form_payment} value={details} onChange={setDetails} onEnter={addLine} />

        <PaymentList payments={payments} onRemove={(index) => setPayments((prev) => prev.filter((_, i) => i !== index))} />

        {error && <p className="mt-3 rounded-lg bg-[var(--red-100)] px-3 py-2 text-[12px] font-medium text-[var(--red-500)]">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink-soft)]"
          >
            Voltar (Esc)
          </button>
          <button
            type="button"
            onClick={() => confirm()}
            disabled={remaining > 0 || payments.length === 0 || submitting}
            className="flex-1 rounded-xl bg-[var(--blue-500)] py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {submitting ? submittingLabel : `F4 ${confirmLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function PaymentList({ payments, onRemove, large = false }: { payments: PaymentModalLine[]; onRemove: (index: number) => void; large?: boolean }) {
  if (payments.length === 0) return null
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {payments.map((payment, index) => (
        <div
          key={index}
          className={`flex items-center justify-between rounded-xl bg-[var(--page)] ${large ? 'px-3.5 py-2.5 text-[14px]' : 'px-3 py-1.5 text-[12.5px]'}`}
        >
          <span className="font-semibold text-[var(--ink)]">{payment.name}</span>
          <span className="flex items-center gap-2 font-bold text-[var(--ink)]">
            {formatCurrency(payment.amount)}
            <button
              type="button"
              aria-label={`Remover pagamento ${payment.name}`}
              onClick={() => onRemove(index)}
              className={`flex items-center justify-center rounded-lg text-[var(--red-500)] ${large ? 'h-8 w-8' : 'h-6 w-6'}`}
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
