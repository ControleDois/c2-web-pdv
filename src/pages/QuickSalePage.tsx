import { useEffect, useRef, useState } from 'react'
import { filterProductBy, type LocalProduct } from '../lib/db'
import { searchPeople, type PersonRecord } from '../lib/people'
import { createSale, type SaleProductPayload, type SalePlotPayload } from '../lib/sales'
import { fetchCashRegisterStatus } from '../lib/cashRegister'
import { useMyCompanyPerson } from '../hooks/useMyCompanyPerson'
import { QuickSaleReceipt, type ReceiptData } from '../components/pdv/QuickSaleReceipt'
import { formatCurrency } from '../lib/format'
import { ApiError } from '../lib/api'
import { ChevronLeftIcon, SearchIcon, TrashIcon, PrinterIcon, AlertTriangleIcon } from '../components/icons'
import type { AuthSession, AuthCompany } from '../lib/auth'

interface QuickSalePageProps {
  session: AuthSession
  company: AuthCompany
  onExit: () => void
}

interface CartItem {
  productId: string
  code?: string
  name: string
  unitValue: number
  quantity: number
}

interface PaymentLine {
  form_payment: number
  name: string
  amount: number
}

type Phase = 'checking' | 'blocked' | 'idle' | 'active'
type Modal = null | 'product' | 'client' | 'payment' | 'remove-confirm' | 'ask-preview' | 'receipt'

const PAYMENT_METHODS = [
  { key: 'N', form_payment: 9, name: 'Dinheiro' },
  { key: 'D', form_payment: 2, name: 'Débito' },
  { key: 'C', form_payment: 1, name: 'Crédito' },
  { key: 'P', form_payment: 10, name: 'PIX' },
]

function parseAmountInput(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const num = Number(normalized)
  return Number.isNaN(num) ? 0 : num
}

export function QuickSalePage({ session, company, onExit }: QuickSalePageProps) {
  const myPerson = useMyCompanyPerson(session, company)
  const config = company.config

  const [phase, setPhase] = useState<Phase>('checking')
  const [blockedMessage, setBlockedMessage] = useState('')

  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [client, setClient] = useState<PersonRecord | null>(null)

  const [modal, setModal] = useState<Modal>(null)

  const [productQuery, setProductQuery] = useState('')
  const [productResults, setProductResults] = useState<LocalProduct[]>([])
  const [productIndex, setProductIndex] = useState(0)
  const productInputRef = useRef<HTMLInputElement>(null)

  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<PersonRecord[]>([])
  const [clientIndex, setClientIndex] = useState(0)

  const [payments, setPayments] = useState<PaymentLine[]>([])
  const [paymentMethodIndex, setPaymentMethodIndex] = useState(0)
  const [paymentAmountInput, setPaymentAmountInput] = useState('')
  const paymentAmountRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)

  const total = cart.reduce((sum, item) => sum + item.unitValue * item.quantity, 0)
  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = Math.max(0, total - paidTotal)

  // Checa se o caixa está aberto antes de liberar a venda rápida (o Angular
  // não checa isso na tela, só descobre quando o backend rejeita a venda —
  // aqui preferimos travar antes, evitando montar o carrinho todo à toa).
  useEffect(() => {
    let cancelled = false
    fetchCashRegisterStatus(session.token.token, company.id)
      .then((status) => {
        if (cancelled) return
        if (status.enabled && !status.session) {
          setBlockedMessage('Caixa fechado — abra o caixa do operador antes de iniciar a venda rápida.')
          setPhase('blocked')
        } else {
          setPhase('idle')
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('idle')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id])

  function resetSale() {
    setCart([])
    setSelectedIndex(0)
    setClient(null)
    setPayments([])
    setPaymentAmountInput('')
    setSubmitError(null)
    setReceipt(null)
  }

  function startSale() {
    resetSale()
    setPhase('active')
  }

  function exitSale() {
    resetSale()
    setPhase('idle')
  }

  function addProductToCart(product: LocalProduct) {
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.productId === product.id)
      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + 1 }
        setSelectedIndex(existingIndex)
        return next
      }
      setSelectedIndex(prev.length)
      return [
        ...prev,
        {
          productId: product.id,
          code: product.code !== undefined ? String(product.code) : undefined,
          name: product.name,
          unitValue: Number(product.sale_value || 0),
          quantity: 1,
        },
      ]
    })
  }

  function openProductModal() {
    setProductQuery('')
    setProductResults([])
    setProductIndex(0)
    setModal('product')
    setTimeout(() => productInputRef.current?.focus(), 0)
  }

  async function handleProductQueryChange(value: string) {
    setProductQuery(value)
    setProductIndex(0)
    if (!value.trim()) {
      setProductResults([])
      return
    }
    const results = await filterProductBy(value.trim())
    setProductResults(results)
  }

  function confirmProductSelection() {
    const product = productResults[productIndex]
    if (!product) return
    addProductToCart(product)
    setModal(null)
  }

  function openClientModal() {
    setClientQuery('')
    setClientResults([])
    setClientIndex(0)
    setModal('client')
  }

  async function handleClientQueryChange(value: string) {
    setClientQuery(value)
    setClientIndex(0)
    if (!value.trim()) {
      setClientResults([])
      return
    }
    try {
      const results = await searchPeople(session.token.token, company.id, value.trim())
      setClientResults(results)
    } catch {
      setClientResults([])
    }
  }

  function openPaymentModal() {
    if (cart.length === 0) return
    setPaymentMethodIndex(0)
    setPaymentAmountInput(remaining ? String(remaining.toFixed(2)).replace('.', ',') : '')
    setModal('payment')
    setTimeout(() => paymentAmountRef.current?.focus(), 0)
  }

  function addPaymentLine() {
    const amount = parseAmountInput(paymentAmountInput)
    if (!amount || amount <= 0) return
    const method = PAYMENT_METHODS[paymentMethodIndex]
    setPayments((prev) => [...prev, { form_payment: method.form_payment, name: method.name, amount }])
    const newRemaining = Math.max(0, remaining - amount)
    setPaymentAmountInput(newRemaining ? String(newRemaining.toFixed(2)).replace('.', ',') : '')
  }

  async function confirmFinalSale() {
    if (remaining > 0 || payments.length === 0 || !myPerson) return
    setSubmitting(true)
    setSubmitError(null)

    const change = paidTotal > total ? paidTotal - total : 0
    const now = new Date()

    const products: SaleProductPayload[] = cart.map((item) => ({
      product_id: item.productId,
      description: item.name,
      amount: item.quantity,
      cost_value: item.unitValue,
      subtotal: item.unitValue * item.quantity,
    }))

    const plots: SalePlotPayload[] = payments.map((payment, index) => ({
      portion: index + 1,
      form_payment: payment.form_payment,
      date_due: now.toISOString().slice(0, 10),
      amount: payment.amount,
      bill_value: payment.amount,
      change: index === payments.length - 1 ? change : 0,
      note: payment.name,
      status: 1,
    }))

    try {
      const sale = await createSale(session.token.token, {
        companyId: company.id,
        peopleId: client?.id || config?.sale_people_default_id || '',
        userId: myPerson.id,
        categoryId: config?.sale_category_default_id ?? undefined,
        bankAccountId: config?.sale_bank_account_default_id ?? undefined,
        role: 1,
        status: 3,
        date_sale: now.toISOString().slice(0, 10),
        amount: total,
        net_total: total,
        note: 'Venda Rápida',
        form_payment: payments[0]?.form_payment ?? 9,
        payment_terms: Math.max(payments.length - 1, 0),
        products,
        plots,
      })

      const receiptData: ReceiptData = {
        companyName: company.people?.name || 'Controle Dois',
        companyDocument: company.people?.document,
        code: sale.code,
        date: now.toISOString(),
        clientName: client?.name,
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitValue: item.unitValue,
          total: item.unitValue * item.quantity,
        })),
        total,
        payments: payments.map((p) => ({ name: p.name, amount: p.amount })),
        change,
      }
      setReceipt(receiptData)

      if (config?.quick_sale_ask_print_preview) {
        setModal('ask-preview')
      } else {
        setModal('receipt')
      }
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Não foi possível registrar a venda. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  function closeReceiptAndReset() {
    resetSale()
    setModal(null)
    setPhase('idle')
  }

  function handlePrint() {
    window.print()
  }

  // Atalhos de tela cheia (F2/F3/F4/setas/Delete/Escape) - só ativos quando
  // nenhum modal está aberto, pra não brigar com o input de busca/pagamento
  // de cada modal (que trata suas próprias teclas localmente).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (phase === 'idle' && modal === null) {
        if (event.key === 'Enter') {
          event.preventDefault()
          startSale()
        }
        return
      }

      if (phase !== 'active' || modal !== null) return

      if (event.key === 'F2') {
        event.preventDefault()
        openProductModal()
      } else if (event.key === 'F3') {
        event.preventDefault()
        openClientModal()
      } else if (event.key === 'F4') {
        event.preventDefault()
        openPaymentModal()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        exitSale()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, cart.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (event.key === '+') {
        event.preventDefault()
        setCart((prev) =>
          prev.map((item, index) => (index === selectedIndex ? { ...item, quantity: item.quantity + 1 } : item))
        )
      } else if (event.key === '-') {
        event.preventDefault()
        setCart((prev) =>
          prev.map((item, index) =>
            index === selectedIndex ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item
          )
        )
      } else if (event.key === 'Delete' && cart.length > 0) {
        event.preventDefault()
        setModal('remove-confirm')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, modal, cart.length, selectedIndex])

  if (phase === 'checking') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--blue-300)] border-t-[var(--blue-500)]" />
      </div>
    )
  }

  if (phase === 'blocked') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--red-100)] text-[var(--red-500)]">
          <AlertTriangleIcon className="h-6 w-6" />
        </span>
        <p className="max-w-sm text-[15px] font-semibold text-[var(--ink)]">{blockedMessage}</p>
        <button
          type="button"
          onClick={onExit}
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          Voltar
        </button>
      </div>
    )
  }

  if (phase === 'idle') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <button
          type="button"
          onClick={onExit}
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <p className="text-[26px] font-bold text-[var(--ink)]">Disponível</p>
        <p className="text-[14px] text-[var(--ink-soft)]">Pressione Enter para iniciar a venda rápida</p>
      </div>
    )
  }

  // phase === 'active'
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex flex-none items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={exitSale}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]"
            title="Esc"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[14px] font-bold text-[var(--ink)]">Venda Rápida</p>
            <p className="text-[11.5px] text-[var(--ink-soft)]">
              {client ? client.name : 'Cliente não informado'} · F3 troca cliente
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-[var(--muted)]">Total</p>
          <p className="text-[20px] font-bold text-[var(--ink)]">{formatCurrency(total)}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--ink-soft)]">
            <p className="text-[14px] font-semibold">Carrinho vazio</p>
            <p className="text-[12.5px]">Pressione F2 pra buscar um produto</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {cart.map((item, index) => (
              <div
                key={item.productId}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition ${
                  index === selectedIndex
                    ? 'border-[var(--blue-500)] bg-[var(--blue-100)]'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-[var(--ink)]">{item.name}</p>
                  <p className="text-[11.5px] text-[var(--ink-soft)]">
                    {item.quantity} x {formatCurrency(item.unitValue)}
                  </p>
                </div>
                <p className="text-[14px] font-bold text-[var(--ink)]">
                  {formatCurrency(item.unitValue * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-none flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <button
          type="button"
          onClick={openProductModal}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-[12.5px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          <SearchIcon className="h-3.5 w-3.5" /> F2 Produto
        </button>
        <button
          type="button"
          onClick={openClientModal}
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-[12.5px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          F3 Cliente
        </button>
        {cart.length > 0 && (
          <button
            type="button"
            onClick={() => setModal('remove-confirm')}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold text-[var(--red-500)] hover:bg-[var(--red-100)]"
          >
            <TrashIcon className="h-3.5 w-3.5" /> Del Remover
          </button>
        )}
        <button
          type="button"
          onClick={openPaymentModal}
          disabled={cart.length === 0}
          className="ml-auto rounded-xl bg-[var(--blue-500)] px-5 py-2.5 text-[13.5px] font-bold text-white hover:bg-[var(--blue-700)] disabled:opacity-50"
        >
          F4 Finalizar
        </button>
      </div>

      {modal === 'product' && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setModal(null)}>
          <div
            className="w-full max-w-lg rounded-2xl bg-[var(--surface)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={productInputRef}
              type="text"
              value={productQuery}
              placeholder="Buscar por código, nome ou código de barras"
              onChange={(e) => handleProductQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setModal(null)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmProductSelection()
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setProductIndex((prev) => Math.min(prev + 1, productResults.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setProductIndex((prev) => Math.max(prev - 1, 0))
                }
              }}
              className="w-full rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
            />
            <div className="mt-2 max-h-72 overflow-y-auto">
              {productResults.map((product, index) => (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => {
                    addProductToCart(product)
                    setModal(null)
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] ${
                    index === productIndex ? 'bg-[var(--blue-100)] text-[var(--blue-700)]' : 'text-[var(--ink)]'
                  }`}
                >
                  <span className="truncate">{product.name}</span>
                  <span className="flex-none font-semibold">{formatCurrency(Number(product.sale_value || 0))}</span>
                </button>
              ))}
              {productQuery && productResults.length === 0 && (
                <p className="px-3 py-2 text-[13px] text-[var(--muted)]">Nenhum produto encontrado.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {modal === 'client' && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setModal(null)}>
          <div
            className="w-full max-w-lg rounded-2xl bg-[var(--surface)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              type="text"
              value={clientQuery}
              placeholder="Buscar cliente por nome ou documento"
              onChange={(e) => handleClientQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setModal(null)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const person = clientResults[clientIndex]
                  if (person) {
                    setClient(person)
                    setModal(null)
                  }
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setClientIndex((prev) => Math.min(prev + 1, clientResults.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setClientIndex((prev) => Math.max(prev - 1, 0))
                }
              }}
              className="w-full rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
            />
            <div className="mt-2 max-h-72 overflow-y-auto">
              {clientResults.map((person, index) => (
                <button
                  type="button"
                  key={person.id}
                  onClick={() => {
                    setClient(person)
                    setModal(null)
                  }}
                  className={`block w-full truncate rounded-lg px-3 py-2 text-left text-[13px] ${
                    index === clientIndex ? 'bg-[var(--blue-100)] text-[var(--blue-700)]' : 'text-[var(--ink)]'
                  }`}
                >
                  {person.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {modal === 'remove-confirm' && cart[selectedIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="w-full max-w-xs rounded-2xl bg-[var(--surface)] p-5 text-center shadow-xl"
            tabIndex={-1}
            ref={(el) => el?.focus()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setModal(null)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                setCart((prev) => prev.filter((_, index) => index !== selectedIndex))
                setSelectedIndex(0)
                setModal(null)
              }
            }}
          >
            <p className="text-[14px] font-semibold text-[var(--ink)]">Remover "{cart[selectedIndex].name}"?</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]"
              >
                Não (Esc)
              </button>
              <button
                type="button"
                onClick={() => {
                  setCart((prev) => prev.filter((_, index) => index !== selectedIndex))
                  setSelectedIndex(0)
                  setModal(null)
                }}
                className="rounded-xl bg-[var(--red-500)] px-4 py-2 text-[13px] font-bold text-white"
              >
                Sim (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'payment' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-5 shadow-xl">
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
                <p className="text-[11px] text-[var(--muted)]">Falta</p>
                <p className="text-[15px] font-bold text-[var(--red-500)]">{formatCurrency(remaining)}</p>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map((method, index) => (
                <button
                  type="button"
                  key={method.key}
                  onClick={() => setPaymentMethodIndex(index)}
                  className={`rounded-xl border px-2 py-2 text-[12px] font-bold transition ${
                    index === paymentMethodIndex
                      ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
                      : 'border-[var(--border)] text-[var(--ink-soft)]'
                  }`}
                >
                  {method.key} · {method.name}
                </button>
              ))}
            </div>

            <input
              ref={paymentAmountRef}
              type="text"
              inputMode="decimal"
              value={paymentAmountInput}
              onChange={(e) => setPaymentAmountInput(e.target.value.replace(/[^\d,]/g, ''))}
              onKeyDown={(e) => {
                const key = e.key.toUpperCase()
                const shortcut = PAYMENT_METHODS.findIndex((m) => m.key === key)
                if (shortcut >= 0) {
                  e.preventDefault()
                  setPaymentMethodIndex(shortcut)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  addPaymentLine()
                } else if (e.key === 'F4') {
                  e.preventDefault()
                  confirmFinalSale()
                } else if (e.key === 'Delete') {
                  e.preventDefault()
                  setPayments((prev) => prev.slice(0, -1))
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setModal(null)
                }
              }}
              className="w-full rounded-xl bg-[var(--page)] px-3.5 py-3 text-center text-[20px] font-bold text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
            />
            <p className="mt-1.5 text-center text-[11px] text-[var(--muted)]">
              Enter adiciona · Delete remove última · F4 confirma
            </p>

            {payments.length > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                {payments.map((payment, index) => (
                  <div key={index} className="flex justify-between text-[12.5px] text-[var(--ink-soft)]">
                    <span>{payment.name}</span>
                    <span className="font-semibold text-[var(--ink)]">{formatCurrency(payment.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {submitError && (
              <p className="mt-3 rounded-lg bg-[var(--red-100)] px-3 py-2 text-[12px] font-medium text-[var(--red-500)]">
                {submitError}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink-soft)]"
              >
                Voltar (Esc)
              </button>
              <button
                type="button"
                onClick={confirmFinalSale}
                disabled={remaining > 0 || payments.length === 0 || submitting}
                className="flex-1 rounded-xl bg-[var(--blue-500)] py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {submitting ? 'Enviando…' : 'F4 Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'ask-preview' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="w-full max-w-xs rounded-2xl bg-[var(--surface)] p-5 text-center shadow-xl"
            tabIndex={-1}
            ref={(el) => el?.focus()}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key.toUpperCase() === 'N') {
                e.preventDefault()
                closeReceiptAndReset()
              } else if (e.key === 'Enter' || e.key.toUpperCase() === 'S') {
                e.preventDefault()
                setModal('receipt')
              }
            }}
          >
            <p className="text-[14px] font-semibold text-[var(--ink)]">Venda registrada! Mostrar comprovante?</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={closeReceiptAndReset}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]"
              >
                Não (N)
              </button>
              <button
                type="button"
                onClick={() => setModal('receipt')}
                className="rounded-xl bg-[var(--blue-500)] px-4 py-2 text-[13px] font-bold text-white"
              >
                Sim (S)
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'receipt' && receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl"
            tabIndex={-1}
            ref={(el) => el?.focus()}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault()
                closeReceiptAndReset()
              }
            }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
              <p className="text-[13.5px] font-bold text-[var(--ink)]">Pré-visualização do comprovante</p>
              <p className="text-[11px] text-[var(--muted)]">
                Modelo: {config?.quick_sale_print_model === 'a4' ? 'Folha A4' : 'Impressora térmica'}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <QuickSaleReceipt data={receipt} printModel={config?.quick_sale_print_model ?? 'thermal'} />
            </div>
            <div className="flex gap-2 border-t border-[var(--border)] p-3.5">
              <button
                type="button"
                onClick={closeReceiptAndReset}
                className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink-soft)]"
              >
                Fechar (Esc)
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--blue-500)] py-2.5 text-[13px] font-bold text-white"
              >
                <PrinterIcon className="h-3.5 w-3.5" /> Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
