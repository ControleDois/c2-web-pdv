import { useEffect, useRef, useState } from 'react'
import { filterProductBy, findProductByCode, type LocalProduct } from '../lib/db'
import { searchPeople, type PersonRecord } from '../lib/people'
import { searchProducts, totalStock, type ProductRecord } from '../lib/products'
import { createSale, type SaleProductPayload, type SalePlotPayload } from '../lib/sales'
import { fetchCashRegisterStatus } from '../lib/cashRegister'
import { useMyCompanyPerson } from '../hooks/useMyCompanyPerson'
import { useIsMobile } from '../hooks/useIsMobile'
import { BarcodeScannerModal, type ScanFeedback } from '../components/pdv/BarcodeScannerModal'
import { loadFrequentProducts, recordFrequentProduct } from '../lib/frequentProducts'
import { QuickSaleReceipt, QuickSalePrintPortal, type ReceiptData } from '../components/pdv/QuickSaleReceipt'
import { NfceHistoryModal } from '../components/pdv/NfceHistoryModal'
import {
  EMPTY_PAYMENT_DETAILS,
  PaymentDetailsFields,
  isElectronicPayment,
  paymentDetailsPayload,
  type PaymentDetails,
} from '../components/pdv/PaymentDetailsFields'
import { PrintHistoryModal } from '../components/pdv/PrintHistoryModal'
import { QuickClientCreate } from '../components/pdv/QuickClientCreate'
import { QuickProductCreate } from '../components/pdv/QuickProductCreate'
import { NfceWhatsappModal } from '../components/pdv/NfceWhatsappModal'
import {
  fetchNfceDetails,
  fetchNfceQrCode,
  generateNfceFromSale,
  isDuplicateNfceError,
  generateNfseFromSale,
  nfceErrorMessage,
  nfseErrorMessage,
  waitNfceOutcome,
  waitNfseOutcome,
  type NfceDetails,
  type NfseOutcome,
} from '../lib/nfce'
import { NfceReceipt, NfcePrintPortal } from '../components/pdv/NfceReceipt'
import { formatCurrency, formatDateTime, formatQuantity, round2 } from '../lib/format'
import { parseScaleLabel, resolveScaleLine, scaleConfigFrom, type ScaleLabel } from '../lib/scale'
import { isValidConsumerDocument } from '../lib/document'
import { formatDocument } from '../lib/formatDocument'
import { buildNfceDocument, buildQuickSaleDocument, createPrintJob, type PrintDocument } from '../lib/printing'
import type { PdvPrinters } from '../lib/terminal'
import { PrintPreviewModal } from '../components/pdv/PrintPreviewModal'
import { issueSaleTokens } from '../lib/saleTokens'
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
  FileTextIcon,
  CameraIcon,
  PlusIcon,
  MoreVerticalIcon,
  CloseIcon,
  WhatsappIcon,
} from '../components/icons'
import type { AuthSession, AuthCompany } from '../lib/auth'

interface QuickSalePageProps {
  session: AuthSession
  company: AuthCompany
  onExit: () => void
  onOpenCashRegister?: () => void
  terminalId?: string
  printers: PdvPrinters
  // Avisa a tela pai quando há venda em andamento (no celular a navegação some para dar lugar ao carrinho).
  onSaleActiveChange?: (active: boolean) => void
}

interface CartItem {
  uid: number
  productId: string
  code?: string
  name: string
  unitValue: number
  quantity: number
  unit?: string
  // Item pesado na balança: o total da etiqueta vale exato, sem recalcular peso x preço.
  lineTotal?: number
  // Produto do tipo Serviço: é o que entra na NFS-e.
  isService?: boolean
}

function itemTotal(item: CartItem): number {
  return item.lineTotal ?? round2(item.unitValue * item.quantity)
}

function isWeighed(item: CartItem): boolean {
  return item.lineTotal !== undefined
}

let cartUidSeed = 0

interface PaymentLine {
  form_payment: number
  name: string
  amount: number
  // Dinheiro entregue pelo cliente (maior que o valor cobrado quando há troco).
  received?: number
  // Bandeira, autorização e CNPJ da operadora digitados à mão (cartão sem TEF) ou ID do PIX.
  card_brand?: string
  payment_authorization?: string
  card_acquirer_cnpj?: string
}

type Phase = 'checking' | 'blocked' | 'idle' | 'active'
type Step = 'scan' | 'name' | 'quantity' | 'price'
type Modal = null | 'product' | 'client' | 'cpf' | 'quick-product' | 'payment' | 'remove-confirm' | 'ask-nfce' | 'nfce' | 'ask-nfse' | 'nfse' | 'ask-preview' | 'receipt'

interface NfseState {
  status: 'sending' | 'authorized' | 'error'
  message: string
  pending?: boolean
  outcome?: NfseOutcome
}

interface NfceState {
  status: 'sending' | 'authorized' | 'error'
  message: string
  pending?: boolean
  // Duplicidade na SEFAZ: não reenviar nem emitir outra nota para a venda.
  duplicate?: boolean
  number?: number
  details?: NfceDetails
  qrCodeUrl?: string | null
  nfeId?: string
}

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

export function QuickSalePage({
  session,
  company,
  onExit,
  onOpenCashRegister,
  terminalId,
  printers,
  onSaleActiveChange,
}: QuickSalePageProps) {
  const isMobile = useIsMobile()
  const myPerson = useMyCompanyPerson(session, company)
  const config = company.config

  const [phase, setPhase] = useState<Phase>('checking')
  const [blockedMessage, setBlockedMessage] = useState('')

  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [client, setClient] = useState<PersonRecord | null>(null)

  const [modal, setModal] = useState<Modal>(null)
  const [nfceHistoryOpen, setNfceHistoryOpen] = useState(false)
  const [printHistoryOpen, setPrintHistoryOpen] = useState(false)

  // Fluxo de bipagem/digitação: um único campo sempre focado, que muda de
  // papel conforme o passo (buscar produto -> quantidade -> preço).
  const [step, setStep] = useState<Step>('scan')
  const [scanQuery, setScanQuery] = useState('')
  const [scanPreview, setScanPreview] = useState<LocalProduct | null>(null)
  const [pendingProduct, setPendingProduct] = useState<LocalProduct | null>(null)
  // Nome digitado para o produto avulso (ask_name), antes de quantidade e preço.
  const [nameInput, setNameInput] = useState('')
  const [quantityInput, setQuantityInput] = useState('1')
  const [priceInput, setPriceInput] = useState('')
  const scanInputRef = useRef<HTMLInputElement>(null)
  // Celular: resultados da busca em toque, mais usados, câmera, menu e cobrança em uma etapa só.
  const [scanResults, setScanResults] = useState<LocalProduct[]>([])
  const [frequent, setFrequent] = useState<LocalProduct[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [missingCode, setMissingCode] = useState<string | null>(null)
  const [payView, setPayView] = useState<'methods' | 'cash' | 'split'>('methods')
  const [cashInput, setCashInput] = useState('')
  const autoStarted = useRef(false)
  const scanSeq = useRef(0)
  const [scanError, setScanError] = useState<string | null>(null)
  const scaleConfig = scaleConfigFrom(config)

  // CPF/CNPJ do consumidor para sair na NFC-e (F5).
  const [consumerDocument, setConsumerDocument] = useState('')
  // Cadastro rápido de produto (F6): o que veio da bipagem entra já preenchido.
  const [quickProductSeed, setQuickProductSeed] = useState({ barcode: '', name: '' })
  const [productNotice, setProductNotice] = useState<string | null>(null)
  const [cpfInput, setCpfInput] = useState('')
  const [cpfError, setCpfError] = useState<string | null>(null)

  const [productModalQuery, setProductModalQuery] = useState('')
  const [productModalResults, setProductModalResults] = useState<ProductRecord[]>([])
  const [productModalIndex, setProductModalIndex] = useState(0)
  const [productModalLoading, setProductModalLoading] = useState(false)

  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<PersonRecord[]>([])
  const [clientIndex, setClientIndex] = useState(0)
  const [creatingClient, setCreatingClient] = useState(false)

  const [payments, setPayments] = useState<PaymentLine[]>([])
  const [paymentMethodIndex, setPaymentMethodIndex] = useState(0)
  const ACQUIRER_STORAGE_KEY = `c2_pdv_card_acquirer_${company.id}`
  // Dados digitados da maquininha; a operadora fica lembrada entre as vendas.
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`c2_pdv_card_acquirer_${company.id}`) || 'null')
      return { ...EMPTY_PAYMENT_DETAILS, acquirer: saved?.acquirer ?? '', otherCnpj: saved?.otherCnpj ?? '' }
    } catch {
      return EMPTY_PAYMENT_DETAILS
    }
  })
  const [paymentAmountInput, setPaymentAmountInput] = useState('')
  const paymentAmountRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [savedSale, setSavedSale] = useState<{ id: string; code?: number } | null>(null)
  const [nfceState, setNfceState] = useState<NfceState | null>(null)
  const [nfceWhatsappOpen, setNfceWhatsappOpen] = useState(false)
  const [nfceSentNote, setNfceSentNote] = useState<string | null>(null)
  const [nfseState, setNfseState] = useState<NfseState | null>(null)
  // Impressoras do cadastro (servidor de impressão): quando escolhidas, imprime
  // direto nelas; sem impressora configurada, mostra o preview como sempre.
  const { receiptPrinterId, nfcePrinterId } = printers
  const [tokenPreview, setTokenPreview] = useState<PrintDocument[] | null>(null)
  // Pergunta "imprimir as fichas?" depois da venda (só quando algum produto gera ficha).
  const [tokenAsk, setTokenAsk] = useState<{ saleId: string; count: number } | null>(null)
  // Comprovante da venda atual guardado também numa ref: a impressão começa
  // no mesmo instante em que o estado `receipt` é gravado (ainda não visível).
  const receiptRef = useRef<ReceiptData | null>(null)
  const [printerNotice, setPrinterNotice] = useState<string | null>(null)
  const [tokenNotice, setTokenNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  // Erro de NFC-e que sobrevive ao reset da venda (o operador pode fechar o
  // comprovante antes do envio terminar) - avisa na tela inicial.
  const [nfceNotice, setNfceNotice] = useState<string | null>(null)
  const nfceMode = config?.quick_sale_nfce_mode ?? 'off'
  const nfseMode = config?.quick_sale_nfse_mode ?? 'off'

  const total = round2(cart.reduce((sum, item) => sum + itemTotal(item), 0))
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
      if (isMobile && step === 'scan') return
      scanInputRef.current?.focus()
      // Nos passos de nome, quantidade e preço o valor já vem selecionado: é só digitar por cima ou dar Enter.
      if (step !== 'scan') scanInputRef.current?.select()
    }
  }, [phase, modal, step, isMobile])

  function resetSale() {
    setCart([])
    setSelectedIndex(0)
    setClient(null)
    setConsumerDocument('')
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
    setScanError(null)
    setScanResults([])
    setPendingProduct(null)
    setQuantityInput('1')
    setPriceInput('')
  }

  function startSale() {
    setNfceNotice(null)
    resetSale()
    setMissingCode(null)
    setFrequent(loadFrequentProducts(company.id))
    setPhase('active')
  }

  function exitSale() {
    resetSale()
    setPhase('idle')
  }

  function addToCart(
    product: LocalProduct,
    quantity: number,
    unitValue: number,
    weighed?: { lineTotal: number }
  ) {
    recordFrequentProduct(company.id, product)
    if (isMobile) scanInputRef.current?.blur()
    setCart((prev) => {
      // Produto avulso e item pesado na balança: cada um é uma linha própria, nunca soma com outra.
      const existingIndex =
        product.ask_name || weighed ? -1 : prev.findIndex((item) => item.productId === product.id && !isWeighed(item))
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
          uid: ++cartUidSeed,
          productId: product.id,
          code: product.code !== undefined ? String(product.code) : undefined,
          name: product.name,
          unitValue,
          quantity,
          unit: weighed ? String(product.unit || 'KG').replace(/\d+$/, '') : undefined,
          lineTotal: weighed?.lineTotal,
          isService: Number(product.role) === 1,
        },
      ]
    })
  }

  // Busca ao vivo (offline, mesmo algoritmo do Angular) a cada tecla digitada
  // - mostra o produto encontrado antes mesmo de apertar Enter.
  async function handleScanChange(value: string) {
    // Só a busca mais recente vale: respostas atrasadas de letras anteriores não sobrescrevem a lista.
    const seq = ++scanSeq.current
    setScanQuery(value)
    setScanError(null)
    if (parseScaleLabel(value, scaleConfig)) {
      setScanPreview(null)
      return
    }
    if (!value.trim()) {
      setScanPreview(null)
      setScanResults([])
      return
    }
    const results = await filterProductBy(value.trim())
    if (seq !== scanSeq.current) return
    setScanPreview(results[0] ?? null)
    setScanResults(results.slice(0, 12))
  }

  // Celular: toque num resultado ou num item mais usado.
  function pickProduct(product: LocalProduct) {
    setScanQuery('')
    setScanPreview(null)
    setScanResults([])
    setScanError(null)
    startProductFlow(product)
  }

  function changeQuantity(uid: number, delta: number) {
    setCart((prev) =>
      prev.map((item) => (item.uid === uid && !isWeighed(item) ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item))
    )
  }

  function removeItem(uid: number) {
    setCart((prev) => prev.filter((item) => item.uid !== uid))
    setSelectedIndex(0)
  }

  // Código lido pela câmera: adiciona direto quando o produto não pede mais nada (quantidade, preço, nome).
  async function handleCameraCode(code: string): Promise<ScanFeedback> {
    const scaleLabel = parseScaleLabel(code, scaleConfig)
    if (scaleLabel) {
      const labelProduct = await findProductByCode(scaleLabel.code)
      if (!labelProduct) return { status: 'not-found', label: `Etiqueta da balança sem produto (código ${scaleLabel.code})` }
      const line = resolveScaleLine(scaleLabel, scaleConfig, Number(labelProduct.sale_value || 0))
      if (!line) return { status: 'not-found', label: `${labelProduct.name}: sem preço cadastrado` }
      addToCart(labelProduct, line.quantity, line.unitValue, { lineTotal: line.total })
      return { status: 'added', label: `${labelProduct.name} adicionado` }
    }
    const wanted = code.trim().toLowerCase()
    const product = (await filterProductBy(code.trim())).find(
      (item) => String(item.code ?? '') === code.trim() || String(item.barcode ?? '').toLowerCase() === wanted
    )
    if (!product) {
      setMissingCode(code.trim())
      return { status: 'not-found', label: `Código ${code} não cadastrado` }
    }
    setMissingCode(null)
    const needsInput =
      Boolean(product.ask_name) ||
      Boolean(config?.quick_sale_ask_quantity) ||
      Boolean(config?.quick_sale_ask_price) ||
      Number(product.sale_value || 0) <= 0
    startProductFlow(product)
    if (needsInput) {
      setCameraOpen(false)
      return { status: 'needs-input', label: product.name }
    }
    return { status: 'added', label: `${product.name} adicionado` }
  }

  function handleScanEnter() {
    if (!scanQuery.trim()) {
      if (cart.length > 0) openPaymentModal()
      return
    }
    const scaleLabel = parseScaleLabel(scanQuery, scaleConfig)
    if (scaleLabel) {
      void addScaleLabel(scaleLabel)
      return
    }
    void openFoundOrRegister(scanPreview, scanQuery.trim())
  }

  // O leitor manda o Enter logo após o último dígito, antes da busca ao vivo terminar:
  // confere de novo antes de oferecer o cadastro, para não cadastrar produto que já existe.
  async function openFoundOrRegister(preview: LocalProduct | null, query: string) {
    const product = preview ?? (await filterProductBy(query))[0] ?? null
    if (!product) {
      openQuickProduct(query)
      return
    }
    setScanQuery('')
    setScanPreview(null)
    startProductFlow(product)
  }

  // Etiqueta da balança: o código do item acha o produto e o valor/peso da etiqueta define a linha,
  // sem passar por quantidade nem preço.
  async function addScaleLabel(label: ScaleLabel) {
    const product = await findProductByCode(label.code)
    resetScan()
    if (!product) {
      setScanError(`Etiqueta da balança: nenhum produto com o código ${label.code}. Cadastre o produto com esse número no código de barras ou sincronize os produtos.`)
      return
    }
    const line = resolveScaleLine(label, scaleConfig, Number(product.sale_value || 0))
    if (!line) {
      setScanError(`"${product.name}" está sem preço cadastrado — informe o preço do produto para vender pela balança.`)
      return
    }
    addToCart(product, line.quantity, line.unitValue, { lineTotal: line.total })
  }

  // Passos depois de escolher um produto: nome (só avulso) -> quantidade (se configurado) -> preço.
  function startProductFlow(product: LocalProduct) {
    setPendingProduct(product)
    if (product.ask_name) {
      setNameInput(String(product.name))
      setStep('name')
      return
    }
    continueAfterName(product)
  }

  function continueAfterName(product: LocalProduct) {
    if (config?.quick_sale_ask_quantity) {
      setQuantityInput('1')
      setStep('quantity')
      return
    }
    advanceToPriceOrAdd(product, 1)
  }

  function handleNameEnter() {
    if (!pendingProduct) return
    const renamed = { ...pendingProduct, name: nameInput.trim() || String(pendingProduct.name) }
    setPendingProduct(renamed)
    continueAfterName(renamed)
  }

  function advanceToPriceOrAdd(product: LocalProduct, quantity: number) {
    // Pergunta o preço quando a loja configurou assim, no produto avulso e em produto sem preço cadastrado.
    const noPrice = Number(product.sale_value || 0) <= 0
    if (config?.quick_sale_ask_price || product.ask_name || noPrice) {
      setPriceInput(noPrice ? '' : String(Number(product.sale_value || 0).toFixed(2)).replace('.', ','))
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
    // Sem preço não entra no carrinho (produto avulso ou sem valor cadastrado).
    if (price <= 0) return
    addToCart(pendingProduct, quantity, price)
    resetScan()
  }

  function handleScanKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (step === 'scan') handleScanEnter()
      else if (step === 'name') handleNameEnter()
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
    if (event.key === 'F5') {
      event.preventDefault()
      openCpfModal()
      return
    }
    if (event.key === 'F6') {
      event.preventDefault()
      openQuickProduct()
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
        prev.map((item, index) =>
          index === selectedIndex && !isWeighed(item) ? { ...item, quantity: item.quantity + 1 } : item
        )
      )
    } else if (event.key === '-' && cart.length > 0) {
      event.preventDefault()
      setCart((prev) =>
        prev.map((item, index) =>
          index === selectedIndex && !isWeighed(item) ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item
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
    startProductFlow({
      id: product.id,
      code: product.code,
      barcode: product.barcode,
      name: product.name,
      sale_value: product.sale_value,
      unit: product.unit,
      ask_name: product.ask_name,
      role: product.role,
    })
  }

  function openClientModal() {
    setCreatingClient(false)
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

  function openQuickProduct(seed = '') {
    const isCode = /^\d{6,}$/.test(seed)
    setQuickProductSeed({ barcode: isCode ? seed : '', name: isCode ? '' : seed })
    setScanQuery('')
    setScanPreview(null)
    setScanError(null)
    setModal('quick-product')
  }

  function handleQuickProductSaved(product: LocalProduct) {
    setModal(null)
    if (phase === 'active') {
      startProductFlow(product)
    } else {
      setProductNotice(`"${product.name}" cadastrado.`)
    }
  }

  function openCpfModal() {
    setCpfInput(consumerDocument ? formatDocument(consumerDocument) : '')
    setCpfError(null)
    setModal('cpf')
  }

  function confirmCpf() {
    const digits = cpfInput.replace(/\D/g, '')
    if (!digits) {
      setConsumerDocument('')
      setModal(null)
      return
    }
    if (!isValidConsumerDocument(digits)) {
      setCpfError('CPF ou CNPJ inválido. Confira os números.')
      return
    }
    setConsumerDocument(digits)
    setModal(null)
  }

  function openPaymentModal() {
    if (cart.length === 0) return
    setPayView('methods')
    setCashInput('')
    setSubmitError(null)
    if (isMobile) setPayments([])
    setPaymentMethodIndex(0)
    setPaymentAmountInput(remaining ? String(remaining.toFixed(2)).replace('.', ',') : '')
    setModal('payment')
    setTimeout(() => {
      paymentAmountRef.current?.focus()
      paymentAmountRef.current?.select()
    }, 0)
  }

  function addPaymentLine() {
    const amount = parseAmountInput(paymentAmountInput)
    if (!amount || amount <= 0) return
    const method = PAYMENT_METHODS[paymentMethodIndex]
    setPayments((prev) => [
      ...prev,
      { form_payment: method.form_payment, name: method.name, amount, ...paymentDetailsPayload(method.form_payment, paymentDetails) },
    ])
    if (isElectronicPayment(method.form_payment)) {
      try {
        localStorage.setItem(ACQUIRER_STORAGE_KEY, JSON.stringify({ acquirer: paymentDetails.acquirer, otherCnpj: paymentDetails.otherCnpj }))
      } catch {
        // sem armazenamento: só não lembra a operadora
      }
    }
    setPaymentDetails((prev) => ({ ...prev, brand: '', authorization: '' }))
    const newRemaining = Math.max(0, remaining - amount)
    setPaymentAmountInput(newRemaining ? String(newRemaining.toFixed(2)).replace('.', ',') : '')
    // O restante já vem selecionado para o próximo pagamento: é só digitar por cima ou dar Enter.
    setTimeout(() => paymentAmountRef.current?.select(), 0)
  }

  // Envia a NFC-e, espera o retorno da SEFAZ e, autorizada, monta o cupom
  // (nosso próprio HTML/CSS, ver NfceReceipt.tsx) na tela pra imprimir e
  // entregar ao consumidor - não depende mais do PDF gerado pelo
  // Delphi/ACBr, que saía em A4/layout de NF-e normal, não de cupom.
  async function emitNfce(sale: { id: string; code?: number }) {
    setModal('nfce')
    setNfceSentNote(null)
    setNfceState({ status: 'sending', message: 'Enviando NFC-e…' })
    try {
      const result = await generateNfceFromSale(session.token.token, sale.id, terminalId)
      const nfeId = result.nfe?.id
      if (!nfeId) throw new Error('sem-id')
      setNfceState({ status: 'sending', message: 'Aguardando a autorização da SEFAZ…' })
      const outcome = await waitNfceOutcome(session.token.token, nfeId)
      if (!outcome.authorized) {
        setNfceState({ status: 'error', message: outcome.message, pending: outcome.pending, duplicate: outcome.duplicate })
        return
      }
      const [details, qrCode] = await Promise.all([
        fetchNfceDetails(session.token.token, nfeId),
        fetchNfceQrCode(session.token.token, nfeId).catch(() => null),
      ])
      setNfceState({
        status: 'authorized',
        message: 'NFC-e autorizada.',
        number: outcome.number,
        nfeId,
        details,
        qrCodeUrl: qrCode?.url ?? null,
      })
      // Impressora cadastrada: a NFC-e autorizada vai direto para ela. Se o envio
      // falhar, o cupom continua na tela para imprimir pelo navegador.
      if (nfcePrinterId && details) {
        const sent = await sendToPrinter(
          nfcePrinterId,
          `NFC-e nº ${details.numero}`,
          buildNfceDocument(details, qrCode?.url ?? null)
        )
        if (sent) {
          setModal(null)
          closeReceiptAndReset()
          return
        }
      }
    } catch (err) {
      const message = err instanceof Error && err.message === 'sem-id' ? 'Não foi possível enviar a NFC-e.' : nfceErrorMessage(err)
      setNfceState({ status: 'error', message, duplicate: isDuplicateNfceError(err) })
      setNfceNotice(`NFC-e da venda ${sale.code ? `#${sale.code} ` : ''}não foi emitida: ${message}`)
    }
  }

  // NFS-e: só os itens de serviço da venda entram na nota. Depois do resultado (ou de seguir sem a
  // nota), a venda segue para a NFC-e (se configurada) e para o comprovante.
  async function emitNfse(sale: { id: string; code?: number }) {
    setModal('nfse')
    setNfseState({ status: 'sending', message: 'Enviando NFS-e…' })
    try {
      const result = await generateNfseFromSale(session.token.token, sale.id)
      const nfseId = result.nfse?.id
      if (!nfseId) throw new Error('sem-id')
      setNfseState({ status: 'sending', message: 'Aguardando a autorização da prefeitura…' })
      const outcome = await waitNfseOutcome(session.token.token, nfseId)
      if (!outcome.authorized) {
        setNfseState({ status: 'error', message: outcome.message, pending: outcome.pending })
        return
      }
      setNfseState({ status: 'authorized', message: outcome.message, outcome })
    } catch (err) {
      const message = err instanceof Error && err.message === 'sem-id' ? 'Não foi possível enviar a NFS-e.' : nfseErrorMessage(err)
      setNfseState({ status: 'error', message })
      setNfceNotice(`NFS-e da venda ${sale.code ? `#${sale.code} ` : ''}não foi emitida: ${message}`)
    }
  }

  function continueAfterNfse(saved: { id: string; code?: number }) {
    setNfseState(null)
    if (nfceMode === 'ask') {
      setModal('ask-nfce')
    } else if (nfceMode === 'always') {
      void emitNfce(saved)
    } else {
      proceedAfterSale()
    }
  }

  function answerNfse(emit: boolean) {
    if (!savedSale) return
    if (emit) void emitNfse(savedSale)
    else continueAfterNfse(savedSale)
  }

  // Manda o documento para a impressora cadastrada. Se não der (servidor de
  // impressão fora do ar não é erro aqui - o trabalho fica na fila), o
  // operador continua com o preview para imprimir pelo navegador.
  async function sendToPrinter(printerId: string, title: string, document: ReturnType<typeof buildQuickSaleDocument>) {
    try {
      await createPrintJob(session.token.token, {
        company_id: company.id,
        printer_id: printerId,
        title,
        payload: document,
      })
      return true
    } catch (err) {
      setPrinterNotice(
        `Não foi possível enviar para a impressora: ${err instanceof ApiError ? err.message : 'tente novamente.'}`
      )
      return false
    }
  }

  async function proceedAfterSale() {
    const currentReceipt = receiptRef.current ?? receipt
    if (receiptPrinterId && currentReceipt) {
      setModal(null)
      const sent = await sendToPrinter(
        receiptPrinterId,
        `Venda rápida${currentReceipt.code ? ` #${currentReceipt.code}` : ''}`,
        buildQuickSaleDocument(currentReceipt)
      )
      if (sent) {
        closeReceiptAndReset()
      } else {
        setModal('receipt')
      }
      return
    }
    setModal(config?.quick_sale_ask_print_preview && !isMobile ? 'ask-preview' : 'receipt')
  }

  function answerNfce(emit: boolean) {
    if (emit && savedSale) {
      void emitNfce(savedSale)
      return
    }
    proceedAfterSale()
  }

  // `lines` vem pronto na cobrança em um toque do celular; sem ele vale a lista montada na tela de pagamento.
  // Celular: tocar na forma de pagamento já quita o total e registra a venda.
  function payFull(methodIndex: number, received?: number) {
    const method = PAYMENT_METHODS[methodIndex]
    const line: PaymentLine = { form_payment: method.form_payment, name: method.name, amount: total, received }
    setPayments([line])
    void confirmFinalSale([line])
  }

  function cashSuggestions(): number[] {
    const notes = [5, 10, 20, 50, 100, 200]
    const values = new Set<number>()
    for (const note of notes) {
      const value = Math.ceil(total / note) * note
      if (value > total) values.add(value)
    }
    return [...values].sort((a, b) => a - b).slice(0, 3)
  }

  async function shareReceipt() {
    if (!receipt) return
    const lines = [
      `*${receipt.companyName}*`,
      `Venda Rápida${receipt.code ? ` #${receipt.code}` : ''} · ${formatDateTime(receipt.date)}`,
      '',
      ...receipt.items.map(
        (item) => `${formatQuantity(item.quantity)}${item.unit ? ` ${item.unit.toLowerCase()}` : 'x'} ${item.name} — ${formatCurrency(item.total)}`
      ),
      '',
      `*Total: ${formatCurrency(receipt.total)}*`,
      ...receipt.payments.map((payment) => `${payment.name}: ${formatCurrency(payment.amount)}`),
      ...(receipt.change > 0 ? [`Troco: ${formatCurrency(receipt.change)}`] : []),
      '',
      'Obrigado pela preferência!',
    ]
    const text = lines.join('\n')
    if (navigator.share) {
      try {
        await navigator.share({ text })
      } catch {
        // compartilhamento cancelado
      }
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noreferrer')
  }

  async function confirmFinalSale(lines: PaymentLine[] = payments) {
    const linesPaid = round2(lines.reduce((sum, line) => sum + line.amount, 0))
    if (lines.length === 0 || linesPaid < total) return
    if (!myPerson) {
      setSubmitError('Ainda carregando o seu usuário. Aguarde um instante e tente de novo.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)

    const change =
      lines.reduce((sum, line) => sum + Math.max(0, (line.received ?? line.amount) - line.amount), 0) +
      (linesPaid > total ? linesPaid - total : 0)
    const now = new Date()

    const products: SaleProductPayload[] = cart.map((item) => ({
      product_id: item.productId,
      description: item.name,
      amount: item.quantity,
      cost_value: item.unitValue,
      subtotal: itemTotal(item),
    }))

    const plots: SalePlotPayload[] = lines.map((payment, index) => ({
      portion: index + 1,
      form_payment: payment.form_payment,
      date_due: now.toISOString().slice(0, 10),
      amount: payment.amount,
      bill_value: payment.amount,
      change: index === lines.length - 1 ? change : 0,
      note: payment.name,
      status: 1,
      card_brand: payment.card_brand,
      payment_authorization: payment.payment_authorization,
      card_acquirer_cnpj: payment.card_acquirer_cnpj,
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
        consumer_document: consumerDocument || undefined,
        form_payment: lines[0]?.form_payment ?? 9,
        payment_terms: Math.max(lines.length - 1, 0),
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
          unit: item.unit,
          quantity: item.quantity,
          unitValue: item.unitValue,
          total: itemTotal(item),
        })),
        total,
        payments: lines.map((p) => ({ name: p.name, amount: p.received ?? p.amount })),
        change,
        companySignatureUrl:
          typeof config?.autentique_signer_signature_url === 'string' ? config.autentique_signer_signature_url : null,
      }
      receiptRef.current = receiptData
      setReceipt(receiptData)
      void checkTokensFor(sale.id)

      const saved = { id: sale.id, code: sale.code }
      setSavedSale(saved)
      setNfceState(null)
      setNfseState(null)

      const hasService = cart.some((item) => item.isService)
      if (hasService && nfseMode === 'ask') {
        setModal('ask-nfse')
      } else if (hasService && nfseMode === 'always') {
        void emitNfse(saved)
      } else {
        continueAfterNfse(saved)
      }
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Não foi possível registrar a venda. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!printerNotice) return
    const timer = setTimeout(() => setPrinterNotice(null), 8000)
    return () => clearTimeout(timer)
  }, [printerNotice])

  useEffect(() => {
    if (!productNotice) return
    const timer = setTimeout(() => setProductNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [productNotice])

  useEffect(() => {
    if (!tokenNotice) return
    const timer = setTimeout(() => setTokenNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [tokenNotice])

  // Fichas dos produtos marcados (uma por unidade, com código de barras): o
  // sistema emite e manda imprimir na impressora do comprovante. Falha aqui
  // não atrapalha a venda, só avisa; as fichas emitidas podem ser reimpressas
  // em Impressões.
  // Antes de emitir, confere se a venda gera fichas e pergunta ao operador se quer imprimir:
  // nem sempre a ficha é necessária. Dizendo "não", nada é emitido e dá para emitir depois em Histórico.
  async function checkTokensFor(saleId: string) {
    try {
      const result = await issueSaleTokens(session.token.token, company.id, saleId, receiptPrinterId, true)
      if (result.reason === 'confirm' && result.tokens > 0) setTokenAsk({ saleId, count: result.tokens })
    } catch (err) {
      setTokenNotice({
        text: `Não foi possível conferir as fichas desta venda: ${err instanceof ApiError ? err.message : 'tente de novo.'}`,
        tone: 'warn',
      })
    }
  }

  function answerTokens(print: boolean) {
    const ask = tokenAsk
    setTokenAsk(null)
    if (!ask) return
    if (print) {
      void issueTokensFor(ask.saleId)
    } else {
      setTokenNotice({ text: 'Fichas não impressas. Para emitir depois, use Histórico → Fichas.', tone: 'warn' })
    }
  }

  async function issueTokensFor(saleId: string) {
    try {
      const result = await issueSaleTokens(session.token.token, company.id, saleId, receiptPrinterId)
      if (!result.tokens || result.reason === 'already_issued') return
      if (!result.printed && result.documents?.length) {
        setTokenPreview(result.documents)
      } else if (result.printed) {
        setTokenNotice({ text: `${result.tokens} ficha${result.tokens === 1 ? '' : 's'} enviada${result.tokens === 1 ? '' : 's'} para a impressora.`, tone: 'ok' })
      } else {
        setTokenNotice({
          text: `${result.tokens} ficha${result.tokens === 1 ? '' : 's'} emitida${result.tokens === 1 ? '' : 's'}, mas sem impressora configurada para imprimir. Configure a impressora do comprovante.`,
          tone: 'warn',
        })
      }
    } catch (err) {
      setTokenNotice({
        text: `Não foi possível emitir as fichas desta venda: ${err instanceof ApiError ? err.message : 'tente de novo.'}`,
        tone: 'warn',
      })
    }
  }

  function closeReceiptAndReset() {
    setSavedSale(null)
    setNfceState(null)
    setNfseState(null)
    resetSale()
    setModal(null)
    if (isMobile) {
      setFrequent(loadFrequentProducts(company.id))
      setPhase('active')
    } else {
      setPhase('idle')
    }
  }

  function handlePrint() {
    window.print()
  }

  // Só o Enter da tela "Disponível" precisa de um listener global - todo o
  // resto do fluxo ativo é tratado no próprio campo de bipagem (sempre
  // focado), então não compete com os inputs dos modais.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (phase === 'idle' && modal === null && tokenAsk === null && event.key === 'Enter') {
        event.preventDefault()
        startSale()
      } else if (phase === 'idle' && modal === null && tokenAsk === null && event.key === 'F6') {
        event.preventDefault()
        openQuickProduct()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, modal, tokenAsk])

  // No celular a primeira venda já abre pronta, sem tela de espera.
  useEffect(() => {
    if (isMobile && phase === 'idle' && !autoStarted.current) {
      autoStarted.current = true
      startSale()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, phase])

  useEffect(() => {
    const active = phase === 'active'
    onSaleActiveChange?.(active)
    if (active && isMobile) document.documentElement.setAttribute('data-mobile-sale', '')
    else document.documentElement.removeAttribute('data-mobile-sale')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isMobile])

  useEffect(
    () => () => {
      onSaleActiveChange?.(false)
      document.documentElement.removeAttribute('data-mobile-sale')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExit}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]"
          >
            Voltar
          </button>
          {onOpenCashRegister && (
            <button
              type="button"
              onClick={onOpenCashRegister}
              className="rounded-xl bg-[var(--blue-500)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--blue-700)]"
            >
              Abrir caixa
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderNfceNote() {
    if (!nfceState) return null
    const tone =
      nfceState.status === 'error'
        ? 'bg-[var(--red-100)] text-[var(--red-500)]'
        : nfceState.status === 'authorized'
          ? 'bg-[var(--green-100)] text-[var(--green-600)]'
          : 'bg-[var(--page)] text-[var(--ink-soft)]'
    return (
      <p className={`rounded-xl px-3.5 py-2 text-[12.5px] font-medium ${tone}`}>
        {nfceState.status === 'error' ? 'NFC-e não enviada: ' : ''}
        {nfceState.message}
      </p>
    )
  }

  // Avisos e pergunta das fichas: aparecem também na tela "Disponível", pois a venda pode
  // voltar a ela antes de a resposta chegar.
  const tokenOverlays = (
    <>
      {tokenNotice && (
        <div
          className={`fixed bottom-16 left-1/2 z-[60] max-w-md -translate-x-1/2 cursor-pointer rounded-xl px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-xl print-hide ${
            tokenNotice.tone === 'ok' ? 'bg-[var(--green-600)]' : 'bg-[var(--amber-500)]'
          }`}
          onClick={() => setTokenNotice(null)}
        >
          {tokenNotice.text}
        </div>
      )}

      {tokenAsk && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-xs rounded-2xl bg-[var(--surface)] p-5 text-center shadow-xl"
            tabIndex={-1}
            ref={(el) => el?.focus()}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key.toUpperCase() === 'N') {
                e.preventDefault()
                e.stopPropagation()
                answerTokens(false)
              } else if (e.key === 'Enter' || e.key.toUpperCase() === 'S') {
                e.preventDefault()
                e.stopPropagation()
                answerTokens(true)
              }
            }}
          >
            <p className="text-[14px] font-semibold text-[var(--ink)]">
              Imprimir {tokenAsk.count} ficha{tokenAsk.count === 1 ? '' : 's'}?
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-soft)]">Uma ficha por unidade dos produtos que usam ficha.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => answerTokens(false)}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]"
              >
                Não (N)
              </button>
              <button
                type="button"
                onClick={() => answerTokens(true)}
                className="rounded-xl bg-[var(--blue-500)] px-4 py-2 text-[13px] font-bold text-white"
              >
                Sim (S)
              </button>
            </div>
          </div>
        </div>
      )}

      <PrintPreviewModal
        open={tokenPreview !== null}
        title="Fichas da venda"
        documents={tokenPreview ?? []}
        onClose={() => setTokenPreview(null)}
      />
    </>
  )

  const quickProductModal = modal === 'quick-product' && (
    <QuickProductCreate
      token={session.token.token}
      companyId={company.id}
      initialBarcode={quickProductSeed.barcode}
      initialName={quickProductSeed.name}
      inSale={phase === 'active'}
      onClose={() => setModal(null)}
      onSaved={handleQuickProductSaved}
    />
  )

  if (phase === 'idle' && isMobile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[var(--page)] p-5 text-center">
        {tokenOverlays}
        {quickProductModal}
        {nfceNotice && (
          <div className="flex w-full items-start justify-between gap-3 rounded-xl bg-[var(--red-100)] px-4 py-2.5 text-left text-[12.5px] font-medium text-[var(--red-500)]">
            <span>{nfceNotice}</span>
            <button type="button" onClick={() => setNfceNotice(null)} className="flex-none font-bold">
              Fechar
            </button>
          </div>
        )}
        {productNotice && (
          <div className="w-full rounded-xl bg-[var(--green-600)] px-4 py-2.5 text-[13px] font-semibold text-white">{productNotice}</div>
        )}
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--blue-500)] text-white shadow-lg">
          <CoinIcon className="h-9 w-9" />
        </span>
        <div>
          <p className="text-[26px] font-bold tracking-tight text-[var(--ink)]">Venda Rápida</p>
          <p className="mt-1 text-[14px] text-[var(--ink-soft)]">Pronta para começar</p>
        </div>
        <button
          type="button"
          onClick={startSale}
          className="w-full max-w-xs rounded-2xl bg-[var(--blue-500)] py-4 text-[17px] font-bold text-white shadow-lg active:bg-[var(--blue-700)]"
        >
          Nova venda
        </button>
        <button
          type="button"
          onClick={() => openQuickProduct()}
          className="flex items-center gap-2 text-[14px] font-semibold text-[var(--ink-soft)]"
        >
          <PlusIcon className="h-4 w-4" /> Cadastrar produto ou serviço
        </button>
      </div>
    )
  }

  if (phase === 'idle') {
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-6 bg-[var(--page)] p-6 text-center">
        {tokenOverlays}
        {quickProductModal}
        {productNotice && (
          <div className="fixed bottom-16 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-[var(--green-600)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-xl">
            {productNotice}
          </div>
        )}
        <button
          type="button"
          onClick={onExit}
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>

        {nfceNotice && (
          <div className="absolute inset-x-16 top-4 flex items-start justify-between gap-3 rounded-xl bg-[var(--red-100)] px-4 py-2.5 text-left text-[12.5px] font-medium text-[var(--red-500)]">
            <span>{nfceNotice}</span>
            <button type="button" onClick={() => setNfceNotice(null)} className="flex-none font-bold">
              Fechar
            </button>
          </div>
        )}

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
          <button
            type="button"
            onClick={() => openQuickProduct()}
            className="flex items-center gap-2 text-[13px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]"
          >
            <kbd className="rounded-md bg-[var(--page)] px-2 py-1 text-[12px] font-bold">F6</kbd> Cadastro rápido de produto
          </button>
        </div>
      </div>
    )
  }

  // phase === 'active'
  const stepIcon = step === 'quantity' || step === 'name' ? BoxIcon : step === 'price' ? TagIcon : SearchIcon
  const StepIcon = stepIcon
  const stepLabel =
    step === 'name'
      ? 'Digite o nome do item'
      : step === 'quantity'
      ? 'Digite a quantidade'
      : step === 'price'
        ? 'Digite o preço'
        : 'Busque ou bipe o código do produto'

  const itemCount = cart.reduce((sum, item) => sum + (isWeighed(item) ? 1 : item.quantity), 0)
  const roundButton =
    'flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-[var(--border)] text-[var(--ink-soft)] active:bg-[var(--page)]'

  const mobileSaleView = (
    <>
      <div className="flex flex-none items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
        <button
          type="button"
          aria-label="Sair da venda"
          onClick={() => {
            if (cart.length === 0 || window.confirm('Descartar esta venda?')) exitSale()
          }}
          className={roundButton}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button type="button" onClick={openClientModal} className="min-w-0 flex-1 text-left">
          <p className="text-[14px] font-bold text-[var(--ink)]">Venda Rápida</p>
          <p className="truncate text-[12px] text-[var(--ink-soft)]">
            {client ? client.name : 'Toque para escolher o cliente'}
            {consumerDocument && <span className="font-semibold text-[var(--blue-700)]"> · CPF na nota</span>}
          </p>
        </button>
        <button
          type="button"
          aria-label="Ler código de barras pela câmera"
          onClick={() => setCameraOpen(true)}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[var(--blue-100)] text-[var(--blue-700)] active:opacity-70"
        >
          <CameraIcon className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Mais opções" onClick={() => setMoreOpen(true)} className={roundButton}>
          <MoreVerticalIcon className="h-5 w-5" />
        </button>
      </div>

      {nfceNotice && (
        <div className="flex flex-none items-start justify-between gap-3 bg-[var(--red-100)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--red-500)]">
          <span>{nfceNotice}</span>
          <button type="button" onClick={() => setNfceNotice(null)} className="flex-none font-bold">
            Fechar
          </button>
        </div>
      )}

      <div className="flex-none border-b border-[var(--border)] bg-[var(--surface)] px-3 pb-3 pt-3">
        {step !== 'scan' && (
          <div className="mb-2 px-1">
            <p className="text-[12.5px] font-bold text-[var(--blue-700)]">{stepLabel}</p>
            {pendingProduct && <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{pendingProduct.name}</p>}
          </div>
        )}
        <input
          ref={scanInputRef}
          type="text"
          inputMode={step === 'scan' || step === 'name' ? 'text' : 'decimal'}
          enterKeyHint={step === 'scan' ? 'search' : 'done'}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          value={step === 'scan' ? scanQuery : step === 'name' ? nameInput : step === 'quantity' ? quantityInput : priceInput}
          onChange={(event) => {
            if (step === 'scan') handleScanChange(event.target.value)
            else if (step === 'name') setNameInput(event.target.value)
            else if (step === 'quantity') setQuantityInput(event.target.value.replace(/[^\d,]/g, ''))
            else setPriceInput(event.target.value.replace(/[^\d,]/g, ''))
          }}
          onKeyDown={handleScanKeyDown}
          placeholder={
            step === 'scan' ? 'Buscar produto ou serviço' : step === 'name' ? 'Nome do item' : step === 'quantity' ? '1' : '0,00'
          }
          className={`w-full rounded-2xl border-2 px-4 py-3.5 text-[20px] font-bold text-[var(--ink)] transition placeholder:text-[16px] placeholder:font-medium focus:outline-none ${
            step === 'scan'
              ? 'border-[var(--border)] bg-[var(--page)] focus:border-[var(--blue-300)]'
              : 'border-[var(--blue-300)] bg-[var(--blue-100)] text-center'
          }`}
        />
        {step !== 'scan' && (
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={resetScan}
              className="flex-1 rounded-2xl border border-[var(--border)] py-3.5 text-[15px] font-semibold text-[var(--ink-soft)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (step === 'name') handleNameEnter()
                else if (step === 'quantity') handleQuantityEnter()
                else handlePriceEnter()
              }}
              className="flex-[2] rounded-2xl bg-[var(--blue-500)] py-3.5 text-[15px] font-bold text-white active:bg-[var(--blue-700)]"
            >
              {step === 'price' ? 'Adicionar à venda' : 'Continuar'}
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {step === 'scan' && scanQuery.trim() ? (
          <div className="flex flex-col gap-2 p-3">
            {scanError && (
              <p className="rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-500)]">{scanError}</p>
            )}
            {scanResults.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => pickProduct(product)}
                className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-left active:bg-[var(--blue-100)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-[var(--ink)]">{product.name}</span>
                  <span className="block text-[11.5px] text-[var(--muted)]">
                    {Number(product.role) === 1 ? 'Serviço' : product.code ? `Cód. ${product.code}` : product.barcode || ''}
                  </span>
                </span>
                <span className="flex-none text-[15px] font-bold text-[var(--green-600)]">
                  {Number(product.sale_value || 0) > 0 ? formatCurrency(Number(product.sale_value)) : 'Informar'}
                </span>
              </button>
            ))}
            {scanResults.length === 0 && !parseScaleLabel(scanQuery, scaleConfig) && (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-center">
                <p className="text-[13.5px] font-semibold text-[var(--ink)]">Nenhum item encontrado</p>
                <button
                  type="button"
                  onClick={() => openQuickProduct(scanQuery.trim())}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--blue-500)] px-4 py-2.5 text-[13.5px] font-bold text-white"
                >
                  <PlusIcon className="h-4 w-4" /> Cadastrar “{scanQuery.trim()}”
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {missingCode && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--amber-100)] px-4 py-3">
                <p className="min-w-0 text-[13px] font-semibold text-[var(--ink)]">Código {missingCode} não cadastrado</p>
                <button
                  type="button"
                  onClick={() => {
                    const code = missingCode
                    setMissingCode(null)
                    openQuickProduct(code)
                  }}
                  className="flex-none rounded-xl bg-[var(--blue-500)] px-3.5 py-2 text-[13px] font-bold text-white"
                >
                  Cadastrar
                </button>
              </div>
            )}

            {step === 'scan' && frequent.length > 0 && (
              <div>
                <p className="mb-1.5 px-1 text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)]">Mais usados · toque para vender</p>
                <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
                  {frequent.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => pickProduct(product)}
                      className="flex min-h-[64px] w-36 flex-none flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left active:bg-[var(--blue-100)]"
                    >
                      <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-[var(--ink)]">{product.name}</span>
                      <span className="mt-1 text-[13px] font-bold text-[var(--green-600)]">
                        {Number(product.sale_value || 0) > 0 ? formatCurrency(Number(product.sale_value)) : 'Informar'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {cart.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] px-6 py-10 text-center text-[var(--ink-soft)]">
                <CoinIcon className="h-8 w-8 text-[var(--muted)]" />
                <p className="text-[14.5px] font-semibold text-[var(--ink)]">Venda vazia</p>
                <p className="text-[12.5px]">
                  Busque pelo nome, toque num item mais usado ou use a câmera <CameraIcon className="inline h-3.5 w-3.5" /> para ler o código de
                  barras.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {cart.map((item) => (
                  <div key={item.uid} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug text-[var(--ink)]">{item.name}</p>
                      <button
                        type="button"
                        aria-label={`Remover ${item.name}`}
                        onClick={() => removeItem(item.uid)}
                        className="-mr-1 -mt-1 flex h-10 w-10 flex-none items-center justify-center rounded-xl text-[var(--red-500)] active:bg-[var(--red-100)]"
                      >
                        <TrashIcon className="h-[18px] w-[18px]" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      {isWeighed(item) ? (
                        <p className="text-[13px] text-[var(--ink-soft)]">
                          {formatQuantity(item.quantity)} {item.unit?.toLowerCase()} · balança
                        </p>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="Diminuir quantidade"
                            onClick={() => changeQuantity(item.uid, -1)}
                            disabled={item.quantity <= 1}
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] text-[22px] font-bold text-[var(--ink)] active:bg-[var(--page)] disabled:opacity-35"
                          >
                            −
                          </button>
                          <span className="min-w-[2.75rem] text-center text-[17px] font-bold text-[var(--ink)]">{formatQuantity(item.quantity)}</span>
                          <button
                            type="button"
                            aria-label="Aumentar quantidade"
                            onClick={() => changeQuantity(item.uid, 1)}
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] text-[22px] font-bold text-[var(--ink)] active:bg-[var(--page)]"
                          >
                            +
                          </button>
                        </div>
                      )}
                      <div className="text-right">
                        <p className="text-[11.5px] text-[var(--muted)]">{formatCurrency(item.unitValue)} cada</p>
                        <p className="text-[17px] font-bold text-[var(--ink)]">{formatCurrency(itemTotal(item))}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-none border-t border-[var(--border)] bg-[var(--surface)] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={openPaymentModal}
          disabled={cart.length === 0}
          className="flex w-full items-center justify-between rounded-2xl bg-[var(--blue-500)] px-5 py-4 text-white shadow-lg active:bg-[var(--blue-700)] disabled:opacity-45"
        >
          <span className="text-[13.5px] font-semibold">
            {itemCount} {itemCount === 1 ? 'item' : 'itens'}
          </span>
          <span className="text-[20px] font-bold">Cobrar {formatCurrency(total)}</span>
        </button>
      </div>

      <NfceHistoryModal
        open={nfceHistoryOpen}
        session={session}
        company={company}
        printerId={nfcePrinterId}
        onClose={() => setNfceHistoryOpen(false)}
      />
      <PrintHistoryModal open={printHistoryOpen} session={session} company={company} onClose={() => setPrintHistoryOpen(false)} />

      {moreOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={() => setMoreOpen(false)}>
          <div
            className="rounded-t-3xl bg-[var(--surface)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--border)]" />
            <div className="flex flex-col gap-1">
              {[
                { label: client ? `Cliente: ${client.name}` : 'Escolher cliente', icon: UserIcon, onClick: openClientModal, show: true },
                {
                  label: consumerDocument ? `CPF na nota: ${formatDocument(consumerDocument)}` : 'CPF/CNPJ na nota',
                  icon: FileTextIcon,
                  onClick: openCpfModal,
                  show: true,
                },
                { label: 'Cadastrar produto ou serviço', icon: PlusIcon, onClick: () => openQuickProduct(), show: true },
                { label: 'Consultar produtos', icon: SearchIcon, onClick: openProductModal, show: true },
                { label: 'NFC-e emitidas', icon: FileTextIcon, onClick: () => setNfceHistoryOpen(true), show: nfceMode !== 'off' },
                { label: 'Impressões', icon: PrinterIcon, onClick: () => setPrintHistoryOpen(true), show: Boolean(receiptPrinterId || nfcePrinterId) },
                {
                  label: 'Limpar a venda',
                  icon: TrashIcon,
                  onClick: () => {
                    if (window.confirm('Descartar todos os itens desta venda?')) resetSale()
                  },
                  show: cart.length > 0,
                  danger: true,
                },
              ]
                .filter((entry) => entry.show)
                .map((entry) => {
                  const Icon = entry.icon
                  return (
                    <button
                      key={entry.label}
                      type="button"
                      onClick={() => {
                        setMoreOpen(false)
                        entry.onClick()
                      }}
                      className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold active:bg-[var(--page)] ${
                        entry.danger ? 'text-[var(--red-500)]' : 'text-[var(--ink)]'
                      }`}
                    >
                      <Icon className="h-5 w-5 flex-none" />
                      <span className="min-w-0 truncate">{entry.label}</span>
                    </button>
                  )
                })}
            </div>
          </div>
        </div>
      )}
    </>
  )

  const mobilePaymentSheet = modal === 'payment' && isMobile && (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={() => !submitting && setModal(null)}>
      <div
        className="max-h-[94svh] overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--border)]" />
        <div className="text-center">
          <p className="text-[12.5px] font-semibold text-[var(--muted)]">Total a cobrar</p>
          <p className="text-[36px] font-bold leading-tight text-[var(--ink)]">{formatCurrency(total)}</p>
          {payView === 'split' && payments.length > 0 && (
            <p className="text-[13px] font-semibold text-[var(--red-500)]">Falta {formatCurrency(remaining)}</p>
          )}
        </div>

        {submitError && (
          <p className="mt-3 rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-500)]">{submitError}</p>
        )}

        {submitting ? (
          <div className="py-10 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--blue-500)]" />
            <p className="mt-3 text-[14px] font-semibold text-[var(--ink)]">Registrando a venda…</p>
          </div>
        ) : payView === 'methods' ? (
          <>
            <p className="mt-3 text-center text-[13px] font-semibold text-[var(--ink-soft)]">Toque na forma de pagamento para finalizar</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {PAYMENT_METHODS.map((method, index) => {
                const MethodIcon = method.icon
                return (
                  <button
                    key={method.key}
                    type="button"
                    onClick={() => {
                      if (method.key === 'N') {
                        setCashInput('')
                        setPayView('cash')
                      } else {
                        payFull(index)
                      }
                    }}
                    className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border)] text-[15px] font-bold text-[var(--ink)] active:border-[var(--blue-500)] active:bg-[var(--blue-100)]"
                  >
                    <MethodIcon className="h-6 w-6 text-[var(--blue-700)]" />
                    {method.name}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setPayments([])
                setPaymentMethodIndex(0)
                setPaymentAmountInput(String(total.toFixed(2)).replace('.', ','))
                setPayView('split')
              }}
              className="mt-3 w-full rounded-2xl py-3.5 text-[14px] font-semibold text-[var(--blue-700)] active:bg-[var(--blue-100)]"
            >
              Dividir em mais de uma forma de pagamento
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
            {parseAmountInput(cashInput) >= total && parseAmountInput(cashInput) > 0 && (
              <>
                <p className="mt-2 text-center text-[14px] font-bold text-[var(--green-600)]">
                  Troco: {formatCurrency(parseAmountInput(cashInput) - total)}
                </p>
                <button
                  type="button"
                  onClick={() => payFull(0, parseAmountInput(cashInput))}
                  className="mt-2 w-full rounded-2xl bg-[var(--blue-500)] py-4 text-[16px] font-bold text-white active:bg-[var(--blue-700)]"
                >
                  Confirmar recebimento
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setPayView('methods')}
              className="mt-2 w-full py-3 text-[14px] font-semibold text-[var(--ink-soft)]"
            >
              Voltar
            </button>
          </>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map((method, index) => (
                <button
                  key={method.key}
                  type="button"
                  onClick={() => setPaymentMethodIndex(index)}
                  className={`rounded-xl border-2 px-1 py-3 text-[12.5px] font-bold ${
                    index === paymentMethodIndex
                      ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
                      : 'border-[var(--border)] text-[var(--ink-soft)]'
                  }`}
                >
                  {method.name}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                ref={paymentAmountRef}
                type="text"
                inputMode="decimal"
                value={paymentAmountInput}
                enterKeyHint="done"
                onChange={(event) => setPaymentAmountInput(event.target.value.replace(/[^\d,]/g, ''))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addPaymentLine()
                  }
                }}
                className="min-w-0 flex-1 rounded-2xl bg-[var(--page)] px-4 py-3.5 text-center text-[20px] font-bold text-[var(--ink)] focus:outline-none"
              />
              <button
                type="button"
                onClick={addPaymentLine}
                disabled={remaining <= 0}
                className="flex-none rounded-2xl bg-[var(--blue-100)] px-5 text-[14px] font-bold text-[var(--blue-700)] disabled:opacity-45"
              >
                Adicionar
              </button>
            </div>
            <PaymentDetailsFields
              formPayment={PAYMENT_METHODS[paymentMethodIndex].form_payment}
              value={paymentDetails}
              onChange={setPaymentDetails}
              onEnter={addPaymentLine}
            />
            {payments.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {payments.map((payment, index) => (
                  <div key={index} className="flex items-center justify-between rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px]">
                    <span className="font-semibold text-[var(--ink)]">{payment.name}</span>
                    <span className="flex items-center gap-2 font-bold text-[var(--ink)]">
                      {formatCurrency(payment.amount)}
                      <button
                        type="button"
                        aria-label={`Remover pagamento ${payment.name}`}
                        onClick={() => setPayments((prev) => prev.filter((_, lineIndex) => lineIndex !== index))}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--red-500)]"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => void confirmFinalSale()}
              disabled={remaining > 0 || payments.length === 0}
              className="mt-3 w-full rounded-2xl bg-[var(--blue-500)] py-4 text-[16px] font-bold text-white active:bg-[var(--blue-700)] disabled:opacity-45"
            >
              Finalizar venda
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

        {!submitting && payView === 'methods' && (
          <button type="button" onClick={() => setModal(null)} className="w-full py-3 text-[14px] font-semibold text-[var(--ink-soft)]">
            Voltar para a venda
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="relative flex h-full flex-col">
      {isMobile ? (
        mobileSaleView
      ) : (
        <>
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
              {consumerDocument && <span className="font-semibold text-[var(--blue-700)]"> · CPF na nota: {formatDocument(consumerDocument)}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setNfceHistoryOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11.5px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"
            title="NFC-e emitidas"
          >
            <FileTextIcon className="h-3.5 w-3.5" /> NFC-e
          </button>
          {(receiptPrinterId || nfcePrinterId) && (
            <button
              type="button"
              onClick={() => setPrintHistoryOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11.5px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"
              title="Impressões enviadas e reimpressão"
            >
              <PrinterIcon className="h-3.5 w-3.5" /> Impressões
            </button>
          )}
          <div className="text-right">
            <p className="text-[11px] text-[var(--muted)]">Total</p>
            <p className="text-[20px] font-bold text-[var(--ink)]">{formatCurrency(total)}</p>
          </div>
        </div>
      </div>

      <NfceHistoryModal
        open={nfceHistoryOpen}
        session={session}
        company={company}
        printerId={nfcePrinterId}
        onClose={() => setNfceHistoryOpen(false)}
      />
      <PrintHistoryModal open={printHistoryOpen} session={session} company={company} onClose={() => setPrintHistoryOpen(false)} />

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
          inputMode={step === 'scan' || step === 'name' ? 'text' : 'decimal'}
          autoFocus
          value={step === 'scan' ? scanQuery : step === 'name' ? nameInput : step === 'quantity' ? quantityInput : priceInput}
          onChange={(event) => {
            if (step === 'scan') handleScanChange(event.target.value)
            else if (step === 'name') setNameInput(event.target.value)
            else if (step === 'quantity') setQuantityInput(event.target.value.replace(/[^\d,]/g, ''))
            else setPriceInput(event.target.value.replace(/[^\d,]/g, ''))
          }}
          onKeyDown={handleScanKeyDown}
          placeholder={
            step === 'scan' ? 'Nome, código ou código de barras…' : step === 'name' ? 'Nome do produto' : step === 'quantity' ? '1' : '0,00'
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
        {step === 'scan' && scanError && (
          <p className="mt-2.5 rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--red-500)]">
            {scanError}
          </p>
        )}
        {step === 'scan' && !scanError && scanQuery.trim() && !scanPreview && !parseScaleLabel(scanQuery, scaleConfig) && (
          <p className="mt-2.5 px-1 text-[12.5px] text-[var(--muted)]">
            Nenhum produto encontrado. <span className="font-semibold text-[var(--blue-700)]">Enter</span> para cadastrar.
          </p>
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
                key={item.uid}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition ${
                  index === selectedIndex
                    ? 'border-[var(--blue-500)] bg-[var(--blue-100)]'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-[var(--ink)]">{item.name}</p>
                  <p className="text-[11.5px] text-[var(--ink-soft)]">
                    {formatQuantity(item.quantity)}{item.unit ? ` ${item.unit.toLowerCase()}` : ''} x {formatCurrency(item.unitValue)}{isWeighed(item) ? ' · balança' : ''}
                  </p>
                </div>
                <p className="text-[14px] font-bold text-[var(--ink)]">
                  {formatCurrency(itemTotal(item))}
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
        <button
          type="button"
          onClick={openCpfModal}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold hover:text-[var(--ink)] ${
            consumerDocument
              ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
              : 'border-[var(--border)] text-[var(--ink-soft)]'
          }`}
        >
          <FileTextIcon className="h-3.5 w-3.5" /> F5 CPF na nota
        </button>
        <button
          type="button"
          onClick={() => openQuickProduct()}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-[12.5px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          <TagIcon className="h-3.5 w-3.5" /> F6 Novo produto
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

        </>
      )}

      {modal === 'product' && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-3 pt-4 sm:pt-16" onClick={() => setModal(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] p-4">
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
                className="w-full flex-none rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[13.5px] sm:w-56 sm:py-2 text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-3 pt-4 sm:pt-16" onClick={() => setModal(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {creatingClient ? (
              <QuickClientCreate
                token={session.token.token}
                companyId={company.id}
                initialName={clientQuery.trim()}
                onCancel={() => setCreatingClient(false)}
                onCreated={(person) => {
                  setClient(person)
                  setCreatingClient(false)
                  setModal(null)
                }}
              />
            ) : (
              <>
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] p-4">
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
                className="w-full flex-none rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[13.5px] sm:w-56 sm:py-2 text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
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
                <div className="flex-none border-t border-[var(--border)] p-3">
                  <button
                    type="button"
                    onClick={() => setCreatingClient(true)}
                    className="w-full rounded-xl bg-[var(--blue-100)] px-4 py-2.5 text-left text-[13px] font-bold text-[var(--blue-700)] hover:bg-[var(--blue-300)]/30"
                  >
                    + Cadastrar novo cliente{clientQuery.trim() ? `: "${clientQuery.trim()}"` : ''}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {quickProductModal}

      {modal === 'cpf' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[14.5px] font-bold text-[var(--ink)]">CPF na nota</p>
            <p className="mt-0.5 text-[11.5px] text-[var(--ink-soft)]">
              Sai no cupom fiscal (NFC-e) desta venda. Deixe em branco para consumidor não identificado.
            </p>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              value={cpfInput}
              placeholder="000.000.000-00"
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '').slice(0, 14)
                setCpfInput(digits ? formatDocument(digits) : '')
                setCpfError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  confirmCpf()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setModal(null)
                }
              }}
              className="mt-3 w-full rounded-xl bg-[var(--page)] px-3.5 py-3 text-center text-[20px] font-bold text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
            />
            {cpfError && <p className="mt-2 text-[12.5px] font-medium text-[var(--red-500)]">{cpfError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              {consumerDocument && (
                <button
                  type="button"
                  onClick={() => {
                    setConsumerDocument('')
                    setModal(null)
                  }}
                  className="mr-auto rounded-xl px-3 py-2 text-[13px] font-semibold text-[var(--red-500)] hover:bg-[var(--red-100)]"
                >
                  Remover
                </button>
              )}
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]"
              >
                Cancelar (Esc)
              </button>
              <button
                type="button"
                onClick={confirmCpf}
                className="rounded-xl bg-[var(--blue-500)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--blue-700)]"
              >
                Confirmar (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'remove-confirm' && cart[selectedIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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

      {mobilePaymentSheet}

      {modal === 'payment' && !isMobile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
            <PaymentDetailsFields
              formPayment={PAYMENT_METHODS[paymentMethodIndex].form_payment}
              value={paymentDetails}
              onChange={setPaymentDetails}
              onEnter={addPaymentLine}
            />

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
                onClick={() => void confirmFinalSale()}
                disabled={remaining > 0 || payments.length === 0 || submitting}
                className="flex-1 rounded-xl bg-[var(--blue-500)] py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {submitting ? 'Enviando…' : 'F4 Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'ask-nfce' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-xs rounded-2xl bg-[var(--surface)] p-5 text-center shadow-xl"
            tabIndex={-1}
            ref={(el) => el?.focus()}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key.toUpperCase() === 'N') {
                e.preventDefault()
                answerNfce(false)
              } else if (e.key === 'Enter' || e.key.toUpperCase() === 'S') {
                e.preventDefault()
                answerNfce(true)
              }
            }}
          >
            <p className="text-[14px] font-semibold text-[var(--ink)]">Venda registrada! Emitir NFC-e?</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => answerNfce(false)}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]"
              >
                Não (N)
              </button>
              <button
                type="button"
                onClick={() => answerNfce(true)}
                className="rounded-xl bg-[var(--blue-500)] px-4 py-2 text-[13px] font-bold text-white"
              >
                Sim (S)
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'ask-nfse' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-xs rounded-2xl bg-[var(--surface)] p-5 text-center shadow-xl"
            tabIndex={-1}
            ref={(el) => el?.focus()}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key.toUpperCase() === 'N') {
                e.preventDefault()
                answerNfse(false)
              } else if (e.key === 'Enter' || e.key.toUpperCase() === 'S') {
                e.preventDefault()
                answerNfse(true)
              }
            }}
          >
            <p className="text-[14px] font-semibold text-[var(--ink)]">Venda registrada! Emitir NFS-e (nota de serviço)?</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => answerNfse(false)}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]"
              >
                Não (N)
              </button>
              <button
                type="button"
                onClick={() => answerNfse(true)}
                className="rounded-xl bg-[var(--blue-500)] px-4 py-2 text-[13px] font-bold text-white"
              >
                Sim (S)
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'nfse' && nfseState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl"
            tabIndex={-1}
            ref={(el) => el?.focus()}
            onKeyDown={(e) => {
              if (nfseState.status === 'sending') return
              if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault()
                if (savedSale) continueAfterNfse(savedSale)
              }
            }}
          >
            <div className="border-b border-[var(--border)] px-5 py-3.5">
              <p className="text-[13.5px] font-bold text-[var(--ink)]">
                NFS-e{nfseState.outcome?.number ? ` nº ${nfseState.outcome.number}` : ''}
              </p>
            </div>

            {nfseState.status === 'sending' && (
              <div className="px-5 py-8 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--blue-500)]" />
                <p className="mt-4 text-[13.5px] font-semibold text-[var(--ink)]">{nfseState.message}</p>
                <p className="mt-1 text-[12px] text-[var(--muted)]">Não feche esta tela.</p>
              </div>
            )}

            {nfseState.status === 'error' && (
              <div className="px-5 py-5">
                <p className="rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--red-500)]">
                  {nfseState.pending ? '' : 'NFS-e não autorizada: '}
                  {nfseState.message}
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => savedSale && continueAfterNfse(savedSale)}
                    className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink-soft)]"
                  >
                    Seguir sem NFS-e
                  </button>
                  {!nfseState.pending && savedSale && (
                    <button
                      type="button"
                      onClick={() => void emitNfse(savedSale)}
                      className="flex-1 rounded-xl bg-[var(--blue-500)] py-2.5 text-[13px] font-bold text-white"
                    >
                      Tentar de novo
                    </button>
                  )}
                </div>
              </div>
            )}

            {nfseState.status === 'authorized' && (
              <>
                <p className="px-5 py-8 text-center text-[13.5px] font-semibold text-[var(--green-600)]">
                  NFS-e autorizada{nfseState.outcome?.number ? ` (nº ${nfseState.outcome.number})` : ''}.
                </p>
                <div className="flex gap-2 border-t border-[var(--border)] p-3.5">
                  <button
                    type="button"
                    onClick={() => savedSale && continueAfterNfse(savedSale)}
                    className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink-soft)]"
                  >
                    Continuar
                  </button>
                  {nfseState.outcome?.pdfUrl && (
                    <a
                      href={nfseState.outcome.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded-xl bg-[var(--blue-500)] py-2.5 text-center text-[13px] font-bold text-white"
                    >
                      Abrir PDF da nota
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {modal === 'nfce' && nfceState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl ${
              nfceState.status === 'authorized' ? 'max-w-lg' : 'max-w-sm'
            }`}
            tabIndex={-1}
            ref={(el) => el?.focus()}
            onKeyDown={(e) => {
              if (nfceState.status === 'sending') return
              if (e.key === 'Escape') {
                e.preventDefault()
                proceedAfterSale()
              } else if (e.key === 'Enter' && nfceState.status === 'authorized' && nfceState.details) {
                e.preventDefault()
                window.print()
              }
            }}
          >
            <div className="border-b border-[var(--border)] px-5 py-3.5">
              <p className="text-[13.5px] font-bold text-[var(--ink)]">
                NFC-e{nfceState.number ? ` nº ${nfceState.number}` : ''}
              </p>
            </div>

            {nfceState.status === 'sending' && (
              <div className="px-5 py-8 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--blue-500)]" />
                <p className="mt-4 text-[13.5px] font-semibold text-[var(--ink)]">{nfceState.message}</p>
                <p className="mt-1 text-[12px] text-[var(--muted)]">Não feche esta tela.</p>
              </div>
            )}

            {nfceState.status === 'error' && (
              <div className="px-5 py-5">
                <p className="rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--red-500)]">
                  {nfceState.pending ? '' : 'NFC-e não autorizada: '}
                  {nfceState.message}
                </p>
                {nfceState.duplicate && (
                  <p className="mt-2 rounded-xl bg-[var(--amber-100)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--ink)]">
                    Esta nota já existe na SEFAZ. <strong>Não tente de novo</strong> e não emita outra nota para esta venda: chame o
                    responsável para conferir no painel em <em>Notas Fiscais &gt; Consultar na SEFAZ</em>.
                  </p>
                )}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={proceedAfterSale}
                    className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink-soft)]"
                  >
                    Seguir sem NFC-e
                  </button>
                  {!nfceState.pending && !nfceState.duplicate && savedSale && (
                    <button
                      type="button"
                      onClick={() => void emitNfce(savedSale)}
                      className="flex-1 rounded-xl bg-[var(--blue-500)] py-2.5 text-[13px] font-bold text-white"
                    >
                      Tentar de novo
                    </button>
                  )}
                </div>
              </div>
            )}

            {nfceState.status === 'authorized' && (
              <>
                {nfceState.details ? (
                  <div className="flex-1 overflow-y-auto bg-[var(--page)] p-5">
                    <div className="mx-auto w-fit rounded-lg bg-white p-3 shadow-sm">
                      <NfceReceipt nfce={nfceState.details} qrCodeUrl={nfceState.qrCodeUrl ?? null} />
                    </div>
                  </div>
                ) : (
                  <p className="px-5 py-8 text-center text-[13px] font-semibold text-[var(--green-600)]">
                    NFC-e autorizada, mas não foi possível carregar o cupom. Consulte em Notas Fiscais.
                  </p>
                )}
                {nfceSentNote && (
                  <p className="border-t border-[var(--border)] px-5 py-2 text-center text-[12.5px] font-semibold text-[var(--green-600)]">
                    {nfceSentNote}
                  </p>
                )}
                <div className="flex gap-2 border-t border-[var(--border)] p-3.5">
                  <button
                    type="button"
                    onClick={proceedAfterSale}
                    className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink-soft)]"
                  >
                    Continuar (Esc)
                  </button>
                  {nfceState.nfeId && (
                    <button
                      type="button"
                      onClick={() => setNfceWhatsappOpen(true)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-bold text-[var(--green-600)]"
                    >
                      <WhatsappIcon className="h-4 w-4" /> WhatsApp
                    </button>
                  )}
                  {nfceState.details && (
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex-1 rounded-xl bg-[var(--blue-500)] py-2.5 text-[13px] font-bold text-white"
                    >
                      Imprimir NFC-e (Enter)
                    </button>
                  )}
                </div>
                {nfceState.details && <NfcePrintPortal nfce={nfceState.details} qrCodeUrl={nfceState.qrCodeUrl ?? null} />}
              </>
            )}
          </div>
        </div>
      )}

      {nfceWhatsappOpen && nfceState?.nfeId && (
        <NfceWhatsappModal
          token={session.token.token}
          companyId={company.id}
          nfeId={nfceState.nfeId}
          numero={nfceState.number ?? nfceState.details?.numero}
          defaultName={client?.name}
          defaultPhone={client?.phone ? String(client.phone) : undefined}
          onClose={() => setNfceWhatsappOpen(false)}
          onSent={(message) => {
            setNfceWhatsappOpen(false)
            setNfceSentNote(message)
          }}
        />
      )}

      {cameraOpen && <BarcodeScannerModal onDetected={handleCameraCode} onClose={() => setCameraOpen(false)} />}

      {tokenOverlays}

      {printerNotice && (
        <div
          className="fixed bottom-4 left-1/2 z-[60] max-w-md -translate-x-1/2 cursor-pointer rounded-xl bg-[var(--red-500)] px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-xl print-hide"
          onClick={() => setPrinterNotice(null)}
        >
          {printerNotice}
        </div>
      )}

      {modal === 'ask-preview' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
            {nfceState && <div className="mt-3">{renderNfceNote()}</div>}
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
              <p className="text-[13.5px] font-bold text-[var(--ink)]">Comprovante da venda</p>
              <p className="hidden text-[11px] text-[var(--muted)] sm:block">
                Modelo: {config?.quick_sale_print_model === 'a4' ? 'Folha A4' : 'Impressora térmica'}
              </p>
            </div>
            {nfceState && (
              <div className="flex flex-none items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-2.5">
                <div className="min-w-0 flex-1">{renderNfceNote()}</div>
                {nfceState.status === 'error' && savedSale && (
                  <button
                    type="button"
                    onClick={() => void emitNfce(savedSale)}
                    className="flex-none rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink)]"
                  >
                    Tentar de novo
                  </button>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-5">
              <QuickSaleReceipt data={receipt} printModel={config?.quick_sale_print_model ?? 'thermal'} />
              <QuickSalePrintPortal data={receipt} printModel={config?.quick_sale_print_model ?? 'thermal'} />
            </div>
            {isMobile ? (
              <div className="flex flex-col gap-2 border-t border-[var(--border)] p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                <p className="text-center text-[13px] font-bold text-[var(--green-600)]">Venda registrada!</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void shareReceipt()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] py-3.5 text-[14px] font-bold text-[var(--ink)]"
                  >
                    <WhatsappIcon className="h-4 w-4" /> Compartilhar
                  </button>
                  <button
                    type="button"
                    onClick={closeReceiptAndReset}
                    className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-[var(--blue-500)] py-3.5 text-[15px] font-bold text-white active:bg-[var(--blue-700)]"
                  >
                    <PlusIcon className="h-4 w-4" /> Nova venda
                  </button>
                </div>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}
