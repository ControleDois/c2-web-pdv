import { useEffect, useRef, useState } from 'react'
import { filterProductBy, type LocalProduct } from '../lib/db'
import { searchPeople, type PersonRecord } from '../lib/people'
import { searchProducts, totalStock, type ProductRecord } from '../lib/products'
import { createSale, type SaleProductPayload, type SalePlotPayload } from '../lib/sales'
import { fetchCashRegisterStatus } from '../lib/cashRegister'
import { useMyCompanyPerson } from '../hooks/useMyCompanyPerson'
import { QuickSaleReceipt, type ReceiptData } from '../components/pdv/QuickSaleReceipt'
import { formatCurrency } from '../lib/format'
import { ApiError } from '../lib/api'
import {
  ChevronLeftIcon,
  SearchIcon,
  TrashIcon,
  PrinterIcon,
  AlertTriangleIcon,
  CoinIcon,
  BoxIcon,
  TagIcon,
  UserIcon,
  WalletIcon,
  CreditCardIcon,
  QrCodeIcon,
} from '../components/icons'
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
type Step = 'scan' | 'quantity' | 'price'
type Modal = null | 'product' | 'client' | 'payment' | 'remove-confirm' | 'ask-preview' | 'receipt'

const PAYMENT_METHODS = [
  { key: 'N', form_payment: 9, name: 'Dinheiro', icon: WalletIcon },
  { key: 'D', form_payment: 2, name: 'Débito', icon: CreditCardIcon },
  { key: 'C', form_payment: 1, name: 'Crédito', icon: CreditCardIcon },
  { key: 'P', form_payment: 10, name: 'PIX', icon: QrCodeIcon },
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

  // Fluxo de bipagem/digitação: um único campo sempre focado, que muda de
  // papel conforme o passo (buscar produto -> quantidade -> preço).
  const [step, setStep] = useState<Step>('scan')
  const [scanQuery, setScanQuery] = useState('')
  const [scanPreview, setScanPreview] = useState<LocalProduct | null>(null)
  const [pendingProduct, setPendingProduct] = useState<LocalProduct | null>(null)
  const [quantityInput, setQuantityInput] = useState('1')
  const [priceInput, setPriceInput] = useState('')
  const scanInputRef = useRef<HTMLInputElement>(null)

  const [productModalQuery, setProductModalQuery] = useState('')
  const [productModalResults, setProductModalResults] = useState<ProductRecord[]>([])
  const [productModalIndex, setProductModalIndex] = useState(0)
  const [productModalLoading, setProductModalLoading] = useState(false)

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

  // Mantém o campo de bipagem sempre em foco durante a venda ativa, exceto
  // quando algum modal está aberto (aí o foco é do modal).
  useEffect(() => {
    if (phase === 'active' && modal === null) {
      scanInputRef.current?.focus()
    }
  }, [phase, modal, step])

  function resetSale() {
    setCart([])
    setSelectedIndex(0)
    setClient(null)
    setPayments([])
    setPaymentAmountInput('')
    setSubmitError(null)
    setReceipt(null)
    resetScan()
  }

  function resetScan() {
    setStep('scan')
    setScanQuery('')
    setScanPreview(null)
    setPendingProduct(null)
    setQuantityInput('1')
    setPriceInput('')
  }

  function startSale() {
    resetSale()
    setPhase('active')
  }

  function exitSale() {
    resetSale()
    setPhase('idle')
  }

  function addToCart(product: LocalProduct, quantity: number, unitValue: number) {
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.productId === product.id)
      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + quantity,
          unitValue,
        }
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
          unitValue,
          quantity,
        },
      ]
    })
  }

  // Busca ao vivo (offline, mesmo algoritmo do Angular) a cada tecla digitada
  // - mostra o produto encontrado antes mesmo de apertar Enter.
  async function handleScanChange(value: string) {
    setScanQuery(value)
    if (!value.trim()) {
      setScanPreview(null)
      return
    }
    const results = await filterProductBy(value.trim())
    setScanPreview(results[0] ?? null)
  }

  function handleScanEnter() {
    if (!scanQuery.trim()) {
      if (cart.length > 0) openPaymentModal()
      return
    }
    if (!scanPreview) return

    const product = scanPreview
    setPendingProduct(product)
    setScanQuery('')
    setScanPreview(null)

    if (config?.quick_sale_ask_quantity) {
      setQuantityInput('1')
      setStep('quantity')
      return
    }
    advanceToPriceOrAdd(product, 1)
  }

  function advanceToPriceOrAdd(product: LocalProduct, quantity: number) {
    if (config?.quick_sale_ask_price) {
      setPriceInput(String(Number(product.sale_value || 0).toFixed(2)).replace('.', ','))
      setStep('price')
      return
    }
    addToCart(product, quantity, Number(product.sale_value || 0))
    resetScan()
  }

  function handleQuantityEnter() {
    if (!pendingProduct) return
    const quantity = Math.max(1, Math.round(parseAmountInput(quantityInput)) || 1)
    advanceToPriceOrAdd(pendingProduct, quantity)
  }

  function handlePriceEnter() {
    if (!pendingProduct) return
    const quantity = Math.max(1, Math.round(parseAmountInput(quantityInput)) || 1)
    const price = parseAmountInput(priceInput) || Number(pendingProduct.sale_value || 0)
    addToCart(pendingProduct, quantity, price)
    resetScan()
  }

  function handleScanKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (step === 'scan') handleScanEnter()
      else if (step === 'quantity') handleQuantityEnter()
      else if (step === 'price') handlePriceEnter()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (step !== 'scan') resetScan()
      else exitSale()
      return
    }
    if (event.key === 'F2') {
      event.preventDefault()
      openProductModal()
      return
    }
    if (event.key === 'F3') {
      event.preventDefault()
      openClientModal()
      return
    }
    if (event.key === 'F4') {
      event.preventDefault()
      openPaymentModal()
      return
    }
    if (step !== 'scan' || scanQuery !== '') return

    if (event.key === 'ArrowDown' && cart.length > 0) {
      event.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, cart.length - 1))
    } else if (event.key === 'ArrowUp' && cart.length > 0) {
      event.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (event.key === '+' && cart.length > 0) {
      event.preventDefault()
      setCart((prev) =>
        prev.map((item, index) => (index === selectedIndex ? { ...item, quantity: item.quantity + 1 } : item))
      )
    } else if (event.key === '-' && cart.length > 0) {
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

  function openProductModal() {
    setProductModalQuery('')
    setProductModalResults([])
    setProductModalIndex(0)
    setModal('product')
  }

  async function handleProductModalQueryChange(value: string) {
    setProductModalQuery(value)
    setProductModalIndex(0)
    if (!value.trim()) {
      setProductModalResults([])
      return
    }
    setProductModalLoading(true)
    try {
      const results = await searchProducts(session.token.token, company.id, value.trim())
      setProductModalResults(results)
    } catch {
      setProductModalResults([])
    } finally {
      setProductModalLoading(false)
    }
  }

  function selectProductFromModal(product: ProductRecord) {
    setModal(null)
    const localProduct: LocalProduct = {
      id: product.id,
      code: product.code,
      barcode: product.barcode,
      name: product.name,
      sale_value: product.sale_value,
    }
    setPendingProduct(localProduct)
    if (config?.quick_sale_ask_quantity) {
      setQuantityInput('1')
      setStep('quantity')
    } else {
      advanceToPriceOrAdd(localProduct, 1)
    }
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

  // Só o Enter da tela "Disponível" precisa de um listener global - todo o
  // resto do fluxo ativo é tratado no próprio campo de bipagem (sempre
  // focado), então não compete com os inputs dos modais.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (phase === 'idle' && modal === null && event.key === 'Enter') {
        event.preventDefault()
        startSale()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, modal])

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
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--red-100)] text-[var(--red-500)]">
          <AlertTriangleIcon className="h-7 w-7" />
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
      <div className="relative flex h-full flex-col items-center justify-center gap-6 bg-[var(--page)] p-6 text-center">
        <button
          type="button"
          onClick={onExit}
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>

        <div className="flex w-full max-w-xl flex-col items-center gap-7 rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-12 py-20 shadow-[var(--card-shadow)] sm:px-28 sm:py-24">
          <div className="relative flex h-28 w-28 items-center justify-center">
            <span className="absolute inset-0 animate-pulse rounded-full bg-[var(--blue-100)]" />
            <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[var(--blue-500)] text-white shadow-lg">
              <CoinIcon className="h-11 w-11" />
            </span>
          </div>
          <div>
            <p className="text-[34px] font-bold tracking-tight text-[var(--ink)]">Disponível</p>
            <p className="mt-2 text-[15px] text-[var(--ink-soft)]">Venda Rápida pronta pra começar</p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-[var(--blue-100)] px-5 py-3">
            <kbd className="rounded-lg bg-[var(--surface)] px-3 py-1.5 text-[15px] font-bold text-[var(--blue-700)] shadow">
              Enter
            </kbd>
            <span className="text-[13.5px] font-semibold text-[var(--blue-700)]">para iniciar a venda</span>
          </div>
        </div>
      </div>
    )
  }

  // phase === 'active'
  const stepIcon = step === 'quantity' ? BoxIcon : step === 'price' ? TagIcon : SearchIcon
  const StepIcon = stepIcon
  const stepLabel =
    step === 'quantity'
      ? 'Digite a quantidade'
      : step === 'price'
        ? 'Digite o preço'
        : 'Busque ou bipe o código do produto'

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

      <div className="flex-none border-b border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-2 px-1 pb-2">
          <StepIcon
            className={`h-4 w-4 ${step === 'scan' ? 'text-[var(--ink-soft)]' : 'text-[var(--blue-700)]'}`}
          />
          <p
            className={`text-[12.5px] font-bold ${step === 'scan' ? 'text-[var(--ink-soft)]' : 'text-[var(--blue-700)]'}`}
          >
            {stepLabel}
            {pendingProduct && step !== 'scan' && <span className="font-normal"> · {pendingProduct.name}</span>}
          </p>
        </div>

        <input
          ref={scanInputRef}
          type="text"
          inputMode={step === 'scan' ? 'text' : 'decimal'}
          autoFocus
          value={step === 'scan' ? scanQuery : step === 'quantity' ? quantityInput : priceInput}
          onChange={(event) => {
            if (step === 'scan') handleScanChange(event.target.value)
            else if (step === 'quantity') setQuantityInput(event.target.value.replace(/[^\d,]/g, ''))
            else setPriceInput(event.target.value.replace(/[^\d,]/g, ''))
          }}
          onKeyDown={handleScanKeyDown}
          placeholder={
            step === 'scan' ? 'Nome, código ou código de barras…' : step === 'quantity' ? '1' : '0,00'
          }
          className={`w-full rounded-2xl border-2 px-4 py-3.5 text-[20px] font-bold text-[var(--ink)] transition focus:outline-none ${
            step === 'scan'
              ? 'border-[var(--border)] bg-[var(--page)] focus:border-[var(--blue-300)]'
              : 'border-[var(--blue-300)] bg-[var(--blue-100)] text-center'
          }`}
        />

        {step === 'scan' && scanPreview && (
          <div className="mt-2.5 flex items-center gap-3 rounded-xl bg-[var(--green-100)] px-3.5 py-2.5">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[var(--surface)] text-[var(--green-600)]">
              <BoxIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold text-[var(--ink)]">{scanPreview.name}</p>
              <p className="text-[11.5px] text-[var(--ink-soft)]">
                {scanPreview.code ? `Cód. ${scanPreview.code}` : scanPreview.barcode || ''}
              </p>
            </div>
            <p className="flex-none text-[16px] font-bold text-[var(--green-600)]">
              {formatCurrency(Number(scanPreview.sale_value || 0))}
            </p>
          </div>
        )}
        {step === 'scan' && scanQuery.trim() && !scanPreview && (
          <p className="mt-2.5 px-1 text-[12.5px] text-[var(--muted)]">Nenhum produto encontrado.</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--ink-soft)]">
            <p className="text-[14px] font-semibold">Carrinho vazio</p>
            <p className="text-[12.5px]">Bipe um produto pra começar</p>
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
          <SearchIcon className="h-3.5 w-3.5" /> F2 Consultar produtos
        </button>
        <button
          type="button"
          onClick={openClientModal}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-[12.5px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          <UserIcon className="h-3.5 w-3.5" /> F3 Cliente
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16" onClick={() => setModal(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[var(--border)] p-4">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[var(--blue-100)] text-[var(--blue-700)]">
                <BoxIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-bold text-[var(--ink)]">Consultar produtos</p>
                <p className="text-[11.5px] text-[var(--ink-soft)]">Busque por nome, código ou código de barras</p>
              </div>
              <input
                autoFocus
                type="text"
                value={productModalQuery}
                placeholder="Digite pra buscar…"
                onChange={(e) => handleProductModalQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setModal(null)
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    const product = productModalResults[productModalIndex]
                    if (product) selectProductFromModal(product)
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setProductModalIndex((prev) => Math.min(prev + 1, productModalResults.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setProductModalIndex((prev) => Math.max(prev - 1, 0))
                  }
                }}
                className="w-56 flex-none rounded-xl bg-[var(--page)] px-3.5 py-2 text-[13.5px] text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {productModalLoading ? (
                <p className="px-4 py-8 text-center text-[13px] text-[var(--muted)]">Buscando…</p>
              ) : productModalResults.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-[var(--muted)]">
                  {productModalQuery ? 'Nenhum produto encontrado.' : 'Digite pra buscar um produto.'}
                </p>
              ) : (
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-[var(--page)]">
                    <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      <th className="py-2 pl-4 pr-2">Descrição</th>
                      <th className="px-2 py-2 text-right">Valor</th>
                      <th className="px-2 py-2 pr-4 text-right">Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productModalResults.map((product, index) => (
                      <tr
                        key={product.id}
                        onClick={() => selectProductFromModal(product)}
                        className={`cursor-pointer border-t border-[var(--border)] transition ${
                          index === productModalIndex ? 'bg-[var(--blue-100)]' : 'hover:bg-[var(--page)]'
                        }`}
                      >
                        <td className="py-2.5 pl-4 pr-2">
                          <p className="font-semibold text-[var(--ink)]">{product.name}</p>
                          <p className="text-[11px] text-[var(--muted)]">
                            {product.code ? `Cód. ${product.code}` : product.barcode || '—'}
                          </p>
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold text-[var(--ink)]">
                          {formatCurrency(Number(product.sale_value || 0))}
                        </td>
                        <td className="px-2 py-2.5 pr-4 text-right text-[var(--ink-soft)]">{totalStock(product)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {modal === 'client' && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16" onClick={() => setModal(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[var(--border)] p-4">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[var(--blue-100)] text-[var(--blue-700)]">
                <UserIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-bold text-[var(--ink)]">Consultar clientes</p>
                <p className="text-[11.5px] text-[var(--ink-soft)]">Busque por nome ou documento</p>
              </div>
              <input
                autoFocus
                type="text"
                value={clientQuery}
                placeholder="Digite pra buscar…"
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
                className="w-56 flex-none rounded-xl bg-[var(--page)] px-3.5 py-2 text-[13.5px] text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {clientResults.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-[var(--muted)]">
                  {clientQuery ? 'Nenhum cliente encontrado.' : 'Digite pra buscar um cliente.'}
                </p>
              ) : (
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-[var(--page)]">
                    <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      <th className="py-2 pl-4 pr-2">Nome</th>
                      <th className="px-2 py-2 pr-4">Documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientResults.map((person, index) => (
                      <tr
                        key={person.id}
                        onClick={() => {
                          setClient(person)
                          setModal(null)
                        }}
                        className={`cursor-pointer border-t border-[var(--border)] transition ${
                          index === clientIndex ? 'bg-[var(--blue-100)]' : 'hover:bg-[var(--page)]'
                        }`}
                      >
                        <td className="py-2.5 pl-4 pr-2 font-semibold text-[var(--ink)]">{person.name}</td>
                        <td className="px-2 py-2.5 pr-4 text-[var(--ink-soft)]">{person.document || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
              {PAYMENT_METHODS.map((method, index) => {
                const MethodIcon = method.icon
                return (
                  <button
                    type="button"
                    key={method.key}
                    onClick={() => setPaymentMethodIndex(index)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11.5px] font-bold transition ${
                      index === paymentMethodIndex
                        ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
                        : 'border-[var(--border)] text-[var(--ink-soft)]'
                    }`}
                  >
                    <MethodIcon className="h-4 w-4" />
                    <span>
                      {method.key} · {method.name}
                    </span>
                  </button>
                )
              })}
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
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault()
                  setPaymentMethodIndex((prev) => Math.min(prev + 1, PAYMENT_METHODS.length - 1))
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  setPaymentMethodIndex((prev) => Math.max(prev - 1, 0))
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
              ← → troca a forma · Enter adiciona · Delete remove última · F4 confirma
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
