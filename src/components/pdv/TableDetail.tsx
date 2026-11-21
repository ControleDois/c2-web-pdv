import { useEffect, useMemo, useRef, useState } from 'react'
import type { FoodTable, FoodTableItem, FoodTablePayment } from '../../lib/foodTypes'
import { activeItems, isDeliveryTable, isIfoodOrder, newLocalId } from '../../lib/foodTypes'
import { buildTableBillDocument, type PrintDocument } from '../../lib/printing'
import { PaymentModal, type PaymentModalLine } from './PaymentModal'
import type { IfoodCancellationReason } from '../../lib/foodApi'
import { ApiError } from '../../lib/api'
import { filterProductBy } from '../../lib/db'
import type { FoodMenu, MenuProduct } from '../../lib/foodMenu'
import { ItemOptionsModal, Stepper, type ItemChoice } from './ItemOptionsModal'
import { TableInfoModal, type TableInfo } from './TableInfoModal'
import { formatCurrency } from '../../lib/format'
import { ChevronLeftIcon, ClockIcon, CopyIcon, PrinterIcon, SearchIcon, TrashIcon, XCircleIcon } from '../icons'

interface TableDetailProps {
  table: FoodTable
  authorId: string
  authorName: string
  onBack: () => void
  onSave: (table: FoodTable) => void
  onAdvanceDeliveryStatus: (status: string) => Promise<void>
  onLoadIfoodCancellationReasons: () => Promise<IfoodCancellationReason[]>
  onCancelIfoodOrder: (code: string, reason: string) => Promise<void>
  // Manda para a impressora do terminal (ou abre a prévia, sem impressora).
  onPrint: (title: string, document: PrintDocument) => Promise<void>
  // Pedido para a produção: o servidor separa por impressora (cozinha, bar...).
  onSendOrder: () => Promise<unknown>
  onReprintOrder: () => Promise<{ jobs: number }>
  companyName: string
  companyDocument?: string | null
  acquirerStorageKey?: string
  // Cardápio (categorias, produtos e adicionais); null = ainda não baixou, busca no catálogo local.
  menu: FoodMenu | null
  // Minutos sem pedir até a mesa entrar em alerta (0 = desligado)
  idleAlertMinutes: number
  // Antes de receber ou fechar: false cancela (ex.: controle de caixa ativo e caixa fechado).
  onBeforeReceive?: () => Promise<boolean>
}


function nowIso(): string {
  return new Date().toISOString()
}

// "3*coca" ou "3 x coca": lança já com a quantidade.
function splitQuantity(value: string): { quantity: number; term: string } {
  const match = value.match(/^\s*(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.+)$/)
  if (!match) return { quantity: 1, term: value.trim() }
  const quantity = Number(match[1].replace(',', '.'))
  return { quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, term: match[2].trim() }
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

function minutesBetween(iso: string | null | undefined, now: number) {
  if (!iso) return 0
  const diff = Math.floor((now - new Date(iso).getTime()) / 60000)
  return Number.isFinite(diff) && diff > 0 ? diff : 0
}

const formatMinutes = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`

const formatHour = (iso: string | null | undefined) => {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const firstName = (name: string | null | undefined) => (name ? name.trim().split(' ')[0] : '')

const AUDIT_DOT: Record<string, string> = {
  success: 'bg-[var(--green-600)]',
  danger: 'bg-[var(--red-500)]',
  warning: 'bg-[var(--amber-500)]',
  default: 'bg-[var(--blue-500)]',
}

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando aceite',
  confirmed: 'Pedido aceito',
  preparing: 'Enviado para cozinha',
  out_for_delivery: 'Saiu para entrega',
  ready_for_pickup: 'Pronto para retirada',
  completed: 'Concluído',
  canceled: 'Cancelado',
}

export function TableDetail({
  table,
  authorId,
  authorName,
  onBack,
  onSave,
  onAdvanceDeliveryStatus,
  onLoadIfoodCancellationReasons,
  onCancelIfoodOrder,
  onPrint,
  onSendOrder,
  onReprintOrder,
  companyName,
  companyDocument,
  acquirerStorageKey,
  menu,
  idleAlertMinutes,
  onBeforeReceive,
}: TableDetailProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [localMatches, setLocalMatches] = useState<MenuProduct[]>([])
  const [optionsFor, setOptionsFor] = useState<{ product: MenuProduct; quantity: number } | null>(null)
  const [mobileView, setMobileView] = useState<'menu' | 'comanda'>('menu')
  const [comandaTab, setComandaTab] = useState<'itens' | 'historico'>('itens')
  const [newestFirst, setNewestFirst] = useState(() => {
    try {
      return localStorage.getItem('c2_pdv_mesa_ordem') === 'recentes'
    } catch {
      return false
    }
  })
  // Receber por itens: marca os itens, recebe só eles e a mesa continua aberta.
  const [payItems, setPayItems] = useState<string[] | null>(null)
  const [receiveItemsOpen, setReceiveItemsOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  function toggleSort() {
    const next = !newestFirst
    setNewestFirst(next)
    try {
      localStorage.setItem('c2_pdv_mesa_ordem', next ? 'recentes' : 'antigos')
    } catch {
      // sem armazenamento: vale só agora
    }
  }
  const inputRef = useRef<HTMLInputElement>(null)

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [cancelItemOpen, setCancelItemOpen] = useState(false)
  const [cancelItemReason, setCancelItemReason] = useState('')
  const [cancelItemByClient, setCancelItemByClient] = useState(false)

  const [cancelTableOpen, setCancelTableOpen] = useState(false)
  const [cancelTableReason, setCancelTableReason] = useState('')
  const [cancelTableByClient, setCancelTableByClient] = useState(false)

  const [ifoodCancelOpen, setIfoodCancelOpen] = useState(false)
  const [ifoodReasons, setIfoodReasons] = useState<IfoodCancellationReason[] | null>(null)
  const [ifoodReasonCode, setIfoodReasonCode] = useState('')
  const [ifoodCancelError, setIfoodCancelError] = useState<string | null>(null)
  const [ifoodCancelLoading, setIfoodCancelLoading] = useState(false)
  const [copiedIfoodId, setCopiedIfoodId] = useState(false)
  const [deliveryBusy, setDeliveryBusy] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  const [receiveTotalOpen, setReceiveTotalOpen] = useState(false)
  const [printNotice, setPrintNotice] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { quantity: typedQuantity, term } = splitQuantity(search)

  // Sem cardápio baixado (primeiro uso sem internet): busca no catálogo local de produtos.
  useEffect(() => {
    if (menu || !term) {
      setLocalMatches([])
      return
    }
    const timeout = setTimeout(() => {
      filterProductBy(term).then((results) =>
        setLocalMatches(
          results.slice(0, 40).map((product) => ({
            id: product.id,
            code: product.code ?? '',
            name: product.name,
            description: null,
            sale_value: Number(product.sale_value || 0),
            unit: product.unit ?? null,
            image_url: null,
            category_ids: [],
            complements: [],
          }))
        )
      )
    }, 100)
    return () => clearTimeout(timeout)
  }, [term, menu])

  const categories = useMemo(() => {
    if (!menu) return []
    const used = new Set(menu.products.flatMap((product) => product.category_ids))
    return menu.categories.filter((item) => used.has(item.id))
  }, [menu])

  const visibleProducts = useMemo(() => {
    if (!menu) return localMatches
    const needle = normalizeText(term)
    return menu.products.filter((product) => {
      if (needle) {
        const code = String(product.code ?? '')
        const internal = String(product.internal_code ?? '')
        return normalizeText(product.name).includes(needle) || code === needle || internal === needle
      }
      return category === 'all' || product.category_ids.includes(category)
    })
  }, [menu, localMatches, term, category])

  const items = activeItems(table)
  const subtotal = items.reduce((sum, item) => sum + item.sub_total, 0)
  const partialTotal = table.partials.reduce((sum, partial) => sum + partial.received, 0)
  const deliveryFee = table.delivery_order?.delivery_fee ?? table.delivery_fee ?? 0
  const receiveTotal = Math.max(0, subtotal + deliveryFee - partialTotal)
  const delivery = isDeliveryTable(table)
  const ifood = isIfoodOrder(table)
  const ifoodFinished = table.delivery_order?.status === 'canceled' || table.delivery_order?.status === 'completed'

  function pushAudit(next: FoodTable, description: string, type: 'default' | 'success' | 'danger' | 'warning', reason = '', requestedByClient = false) {
    next.audit.push({
      id: newLocalId(),
      companyId: table.companyId,
      user_id: authorId,
      synchronized: 'N',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
      moment: nowIso(),
      description,
      reason,
      author: authorId,
      author_name: authorName,
      type,
      requested_by_client: requestedByClient,
    })
  }

  function addItem(product: MenuProduct, quantity: number, unitValue: number, observation: string) {
    const next: FoodTable = { ...table, items: [...table.items], orders: [...table.orders], audit: [...table.audit] }
    // Mesmo produto, mesmo preço e mesma observação ainda não enviado: só soma na linha.
    const same = next.items.find(
      (item) =>
        item.print_hold &&
        !item.removed &&
        item.product_id === product.id &&
        item.unit_price === unitValue &&
        (item.observation || '') === observation
    )
    if (same) {
      changeHeldQuantity(same.id, same.quantity + quantity, `LANÇOU ${quantity} ${product.name}`)
      return
    }
    const itemNumber = next.items.reduce((max, item) => Math.max(max, item.item), 0) + 1
    const orderId = newLocalId()
    const item: FoodTableItem = {
      id: newLocalId(),
      companyId: table.companyId,
      user_id: authorId,
      synchronized: 'N',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
      item: itemNumber,
      product_id: product.id,
      code: String(product.code ?? ''),
      product_code: String(product.code ?? ''),
      name: product.name,
      quantity,
      unit_value: unitValue,
      unit_price: unitValue,
      sub_total: unitValue * quantity,
      total: unitValue * quantity,
      removed: false,
      selected: false,
      pending_print: true,
      print_hold: true,
      food_order_id: orderId,
      observation: observation || undefined,
      author: authorId,
      author_name: authorName,
    }
    next.items.push(item)
    next.orders.push({
      id: orderId,
      companyId: table.companyId,
      user_id: authorId,
      synchronized: 'N',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
      moment: nowIso(),
      author: authorId,
      author_name: authorName,
      items: [{ item: itemNumber, code: item.code, product_code: item.product_code, name: item.name, quantity }],
    })

    if (table.status === 'closed') pushAudit(next, 'REABERTURA POR NOVO LANÇAMENTO', 'warning')
    pushAudit(next, `LANÇOU ${quantity} ${product.name}${observation ? ` (${observation})` : ''}`, 'default')

    next.status = 'open_with_items'
    next.last_order_at = nowIso()
    onSave(next)
  }

  // Item ainda não enviado para a produção: muda a quantidade ou tira da comanda sem pedir motivo.
  function changeHeldQuantity(itemId: string, quantity: number, auditText?: string) {
    const target = table.items.find((item) => item.id === itemId)
    if (!target || !target.print_hold) return
    const next: FoodTable = { ...table, items: [...table.items], orders: [...table.orders], audit: [...table.audit] }
    if (quantity <= 0) {
      next.items = next.items.filter((item) => item.id !== itemId)
      next.orders = next.orders
        .map((order) => ({ ...order, items: order.items.filter((ref) => ref.item !== target.item) }))
        .filter((order) => order.items.length > 0 || order.id !== target.food_order_id)
      pushAudit(next, `TIROU ${target.quantity} ${target.name} (ANTES DE ENVIAR)`, 'warning')
    } else {
      next.items = next.items.map((item) =>
        item.id === itemId ? { ...item, quantity, sub_total: item.unit_price * quantity, total: item.unit_price * quantity, updatedAt: nowIso() } : item
      )
      next.orders = next.orders.map((order) => ({
        ...order,
        items: order.items.map((ref) => (ref.item === target.item ? { ...ref, quantity } : ref)),
      }))
      if (auditText) pushAudit(next, auditText, 'default')
    }
    next.status = activeItems(next).length > 0 ? 'open_with_items' : 'open_empty'
    onSave(next)
  }

  function pickProduct(product: MenuProduct, quantity = 1) {
    if (product.complements.length > 0) {
      setOptionsFor({ product, quantity })
      return
    }
    addItem(product, quantity, Number(product.sale_value || 0), '')
    setSearch('')
    inputRef.current?.focus()
  }

  function confirmOptions(choice: ItemChoice) {
    if (!optionsFor) return
    addItem(optionsFor.product, choice.quantity * optionsFor.quantity, choice.unitPrice, choice.observation)
    setOptionsFor(null)
    setSearch('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function handleSearchSubmit() {
    if (!search.trim()) {
      leaveTable()
      return
    }
    const first = visibleProducts[0]
    if (first) pickProduct(first, typedQuantity)
  }

  function openCancelItem(itemId?: string) {
    const target = itemId ?? selectedItemId ?? items[items.length - 1]?.id ?? null
    if (!target) return
    setSelectedItemId(target)
    setCancelItemReason('')
    setCancelItemByClient(false)
    setCancelItemOpen(true)
  }

  function confirmCancelItem() {
    if (!selectedItemId || !cancelItemReason.trim()) return
    const item = table.items.find((i) => i.id === selectedItemId)
    if (!item) return
    const next: FoodTable = { ...table, items: table.items.map((i) => (i.id === selectedItemId ? { ...i, removed: true, selected: false, pending_print: false } : i)), audit: [...table.audit] }
    pushAudit(next, `CANCELOU ${item.quantity} ${item.name}`, 'danger', cancelItemReason.trim(), cancelItemByClient)
    const stillActive = activeItems(next)
    next.status = stillActive.length > 0 ? 'open_with_items' : 'open_empty'
    setCancelItemOpen(false)
    onSave(next)
  }

  async function advanceDelivery(status: string) {
    setDeliveryBusy(true)
    setDeliveryError(null)
    try {
      await onAdvanceDeliveryStatus(status)
    } catch (err) {
      setDeliveryError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o pedido.')
    } finally {
      setDeliveryBusy(false)
    }
  }

  async function openIfoodCancel() {
    setIfoodCancelOpen(true)
    setIfoodCancelError(null)
    setIfoodReasons(null)
    setIfoodReasonCode('')
    try {
      setIfoodReasons(await onLoadIfoodCancellationReasons())
    } catch (err) {
      setIfoodCancelError(err instanceof ApiError ? err.message : 'Não foi possível carregar os motivos do iFood.')
    }
  }

  async function confirmIfoodCancel() {
    const reason = ifoodReasons?.find((item) => item.code === ifoodReasonCode)
    if (!reason) return
    setIfoodCancelLoading(true)
    setIfoodCancelError(null)
    try {
      await onCancelIfoodOrder(reason.code, reason.description)
      setIfoodCancelOpen(false)
    } catch (err) {
      setIfoodCancelError(err instanceof ApiError ? err.message : 'O iFood não aceitou o cancelamento.')
    } finally {
      setIfoodCancelLoading(false)
    }
  }

  function copyIfoodId() {
    const id = table.delivery_order?.external_order_id
    if (!id) return
    navigator.clipboard?.writeText(id)
    setCopiedIfoodId(true)
    setTimeout(() => setCopiedIfoodId(false), 2000)
  }

  function confirmCancelTable() {
    if (!cancelTableReason.trim()) return
    const next: FoodTable = {
      ...table,
      items: table.items.map((i) => ({ ...i, removed: true })),
      audit: [...table.audit],
      status: 'canceled',
      closed_at: nowIso(),
    }
    pushAudit(next, 'CANCELOU A MESA', 'danger', cancelTableReason.trim(), cancelTableByClient)
    setCancelTableOpen(false)
    onSave(next)
    onBack()
  }

  const tableLabel = delivery
    ? `Delivery ${table.kind === 'delivery' && table.number > 9000 ? table.number - 9000 : table.number}`
    : `Mesa ${table.number}`
  const manualDelivery = table.kind === 'delivery' && !table.delivery_order
  // Cliente e entrega no papel da conta/recibo.
  const customerLines = [
    table.customer_name ? `Cliente: ${table.customer_name}` : '',
    table.customer_phone ? `Tel: ${table.customer_phone}` : '',
    manualDelivery && table.delivery_address ? `Entrega: ${table.delivery_address}` : '',
  ].filter(Boolean)

  function saveInfo(info: TableInfo) {
    const next: FoodTable = {
      ...table,
      customer_name: info.customer_name || null,
      audit: [...table.audit],
      ...(manualDelivery
        ? { customer_phone: info.customer_phone || null, delivery_address: info.delivery_address || null, delivery_fee: info.delivery_fee }
        : {}),
    }
    if ((info.customer_name || '') !== (table.customer_name || '')) {
      pushAudit(next, info.customer_name ? `IDENTIFICOU ${delivery ? 'O DELIVERY' : 'A MESA'}: ${info.customer_name}` : 'TIROU O NOME DA MESA', 'default')
    }
    if (manualDelivery && (info.delivery_fee !== (table.delivery_fee ?? 0) || info.delivery_address !== (table.delivery_address ?? ''))) {
      pushAudit(next, `ALTEROU DADOS DA ENTREGA (taxa ${formatCurrency(info.delivery_fee)})`, 'default')
    }
    setInfoOpen(false)
    onSave(next)
  }
  const heldItems = items.filter((item) => item.print_hold)

  function printItems() {
    return items.map((item) => ({ name: item.name, quantity: item.quantity, total: item.sub_total, observation: item.observation }))
  }

  async function print(title: string, document: PrintDocument) {
    try {
      await onPrint(title, document)
      setPrintNotice(null)
      return true
    } catch (err) {
      setPrintNotice(`Não foi possível imprimir: ${err instanceof ApiError ? err.message : 'tente novamente.'}`)
      return false
    }
  }

  async function handleSendOrder() {
    try {
      await onSendOrder()
      setPrintNotice(null)
    } catch (err) {
      // Mostra o motivo que o servidor devolveu; sem internet, o pedido segue na fila e vai sozinho.
      setPrintNotice(
        err instanceof ApiError
          ? `O servidor recusou o pedido: ${err.message}`
          : 'Sem conexão com o servidor agora. O pedido vai sozinho assim que a internet voltar.'
      )
    }
  }

  async function handleReprintOrder() {
    try {
      const result = await onReprintOrder()
      setPrintNotice(result.jobs ? null : 'Nada para reimprimir: confira as impressoras dos pedidos em Impressoras > Pedidos.')
    } catch (err) {
      setPrintNotice(`Não foi possível reimprimir: ${err instanceof ApiError ? err.message : 'tente novamente.'}`)
    }
  }

  function leaveTable() {
    onBack()
  }

  function handlePrintBill() {
    void print(
      `Conta ${tableLabel}`,
      buildTableBillDocument({
        companyName,
        companyDocument,
        label: tableLabel,
        customer: customerLines,
        items: printItems(),
        subtotal,
        deliveryFee,
        alreadyReceived: partialTotal,
        total: receiveTotal,
      })
    )
  }

  function openReceiveTotal() {
    setReceiveTotalOpen(true)
  }

  async function handleCloseTable() {
    if (items.length > 0 && onBeforeReceive && !(await onBeforeReceive())) return
    if (items.length > 0 && table.sales.length === 0 && receiveTotal > 0) {
      openReceiveTotal()
      return
    }
    const next: FoodTable = { ...table, items: table.items.map((i) => ({ ...i, selected: false, print_hold: false })), audit: [...table.audit], status: 'closed', closed_at: nowIso() }
    pushAudit(next, 'FECHAMENTO DE MESA', 'success')
    onSave(next)
    onBack()
  }

  async function confirmReceiveTotal(lines: PaymentModalLine[], change: number) {
    const receivePayments: FoodTablePayment[] = lines.map((line) => ({ form_payment: line.form_payment, amount: line.amount }))
    setReceiveTotalOpen(false)
    const next: FoodTable = { ...table, sales: [...table.sales], partials: [...table.partials], items: table.items.map((i) => ({ ...i, selected: false, print_hold: false })), audit: [...table.audit] }
    next.sales.push({
      id: newLocalId(),
      companyId: table.companyId,
      user_id: authorId,
      synchronized: 'N',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
      moment: nowIso(),
      table_number: table.number,
      subtotal,
      partial: partialTotal,
      total: receiveTotal,
      author: authorId,
      author_name: authorName,
      payment_method: receivePayments[receivePayments.length - 1]?.form_payment ?? 9,
      payments: receivePayments,
    })
    next.partials.push({
      id: newLocalId(),
      companyId: table.companyId,
      user_id: authorId,
      synchronized: 'N',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
      moment: nowIso(),
      description: 'RECEBIMENTO TOTAL',
      received: receiveTotal,
      author: authorId,
      author_name: authorName,
      item_ids: [],
      payments: receivePayments,
    })
    pushAudit(next, 'RECEBIMENTO TOTAL', 'success')
    next.status = 'closed'
    next.closed_at = nowIso()
    onSave(next)
    await print(
      `Recebimento ${tableLabel}`,
      buildTableBillDocument({
        companyName,
        companyDocument,
        label: tableLabel,
        customer: customerLines,
        items: printItems(),
        subtotal,
        deliveryFee,
        alreadyReceived: partialTotal,
        total: receiveTotal,
        payments: lines.map((line) => ({ name: line.name, amount: line.received ?? line.amount })),
        change,
      })
    )
    onBack()
  }

  async function confirmReceiveItems(lines: PaymentModalLine[], change: number) {
    const paidIds = new Set(chosenToPay.map((item) => item.id))
    const receivePayments: FoodTablePayment[] = lines.map((line) => ({ form_payment: line.form_payment, amount: line.amount }))
    const description = `RECEBEU ${chosenToPay.map((item) => `${item.quantity} ${item.name}`).join(', ')}`.slice(0, 250)
    const next: FoodTable = {
      ...table,
      partials: [...table.partials],
      items: table.items.map((item) => (paidIds.has(item.id) ? { ...item, is_received: true, updatedAt: nowIso() } : item)),
      audit: [...table.audit],
    }
    next.partials.push({
      id: newLocalId(),
      companyId: table.companyId,
      user_id: authorId,
      synchronized: 'N',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
      moment: nowIso(),
      description,
      received: chosenTotal,
      author: authorId,
      author_name: authorName,
      item_ids: [...paidIds],
      payments: receivePayments,
    })
    pushAudit(next, description, 'success')
    setReceiveItemsOpen(false)
    setPayItems(null)
    onSave(next)
    await print(
      `Recebimento ${tableLabel}`,
      buildTableBillDocument({
        companyName,
        companyDocument,
        label: `${tableLabel} (parcial)`,
        customer: customerLines,
        items: chosenToPay.map((item) => ({ name: item.name, quantity: item.quantity, total: item.sub_total, observation: item.observation })),
        subtotal: chosenTotal,
        total: chosenTotal,
        payments: lines.map((line) => ({ name: line.name, amount: line.received ?? line.amount })),
        change,
      })
    )
  }

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const sortedItems = [...items].sort((a, b) =>
    newestFirst
      ? (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.item - a.item
      : (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.item - b.item
  )
  const lastOrder = items.map((item) => item.createdAt ?? '').filter(Boolean).sort().pop() ?? table.opened_at
  const minutesInHouse = minutesBetween(table.opened_at, now)
  const minutesWithoutOrder = minutesBetween(lastOrder, now)
  const idle = idleAlertMinutes > 0 && items.length > 0 && minutesWithoutOrder >= idleAlertMinutes
  const history = [...table.audit].sort((a, b) => (b.moment ?? '').localeCompare(a.moment ?? ''))
  const payableItems = items.filter((item) => !item.is_received && !item.print_hold)
  const chosenToPay = payItems ? payableItems.filter((item) => payItems.includes(item.id)) : []
  const chosenTotal = Math.round(chosenToPay.reduce((sum, item) => sum + item.sub_total, 0) * 100) / 100

  // Algum produto com foto: os sem foto ganham a inicial no lugar, para os cartões ficarem iguais.
  const withPhotos = visibleProducts.some((product) => product.image_url)

  const menuPanel = (
    <section className={`${mobileView === 'menu' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col md:flex`}>
      <div className="flex-none space-y-2.5 p-3 sm:p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleSearchSubmit()
          }}
          className="flex items-center gap-2.5 rounded-2xl bg-[var(--surface)] px-4 py-3 shadow-[var(--card-shadow)] ring-1 ring-transparent focus-within:ring-[var(--blue-300)]"
        >
          <SearchIcon className="h-4.5 w-4.5 flex-none text-[var(--muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                if (search) setSearch('')
                else leaveTable()
              }
            }}
            placeholder="Buscar produto ou código (3*coca lança 3)"
            className="w-full bg-transparent text-[15px] text-[var(--ink)] placeholder:text-[13px] placeholder:text-[var(--muted)] focus:outline-none"
          />
          {typedQuantity !== 1 && term && (
            <span className="flex-none rounded-full bg-[var(--blue-100)] px-2.5 py-0.5 text-[12px] font-bold text-[var(--blue-700)]">{typedQuantity}x</span>
          )}
        </form>
        {categories.length > 0 && !term && (
          <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:-mx-4 sm:px-4 [&::-webkit-scrollbar]:hidden">
            {[{ id: 'all', name: 'Todos' }, ...categories].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={`flex-none rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition ${
                  category === item.id
                    ? 'bg-[var(--blue-500)] text-white'
                    : 'bg-[var(--surface)] text-[var(--ink-soft)] shadow-[var(--card-shadow)] hover:text-[var(--ink)]'
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 sm:px-4 md:pb-4">
        {visibleProducts.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-[var(--muted)]">
            {term ? `Nenhum produto encontrado para "${term}".` : menu ? 'Nenhum produto nesta categoria.' : 'Digite o nome ou o código do produto.'}
          </p>
        ) : (
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {visibleProducts.map((product, index) => (
              <button
                key={product.id}
                type="button"
                onClick={() => pickProduct(product, term ? typedQuantity : 1)}
                className={`group flex min-h-[88px] flex-col overflow-hidden rounded-2xl bg-[var(--surface)] text-left shadow-[var(--card-shadow)] ring-1 transition hover:-translate-y-0.5 hover:ring-[var(--blue-300)] active:scale-[0.98] ${
                  term && index === 0 ? 'ring-[var(--blue-500)]' : 'ring-transparent'
                }`}
              >
                {product.image_url ? (
                  <img src={product.image_url} alt="" loading="lazy" className="aspect-[4/3] w-full flex-none bg-[var(--page)] object-cover" />
                ) : (
                  withPhotos && (
                    <span className="flex aspect-[4/3] w-full flex-none items-center justify-center bg-[var(--blue-100)] text-[34px] font-bold text-[var(--blue-700)]">
                      {product.name.trim().charAt(0).toUpperCase()}
                    </span>
                  )
                )}
                <span className="flex flex-1 flex-col justify-between p-3">
                <span className="line-clamp-2 text-[13.5px] font-bold leading-snug text-[var(--ink)]">{product.name}</span>
                <span className="mt-2 flex items-end justify-between gap-1">
                  <span className="text-[13.5px] font-bold text-[var(--blue-700)]">{formatCurrency(Number(product.sale_value || 0))}</span>
                  {product.complements.length > 0 && (
                    <span className="rounded-full bg-[var(--amber-100)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--amber-500)]">adicionais</span>
                  )}
                </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )

  const comandaPanel = (
    <aside
      className={`${mobileView === 'comanda' ? 'flex' : 'hidden'} min-h-0 w-full flex-none flex-col border-[var(--border)] bg-[var(--surface)] md:flex md:w-[380px] md:border-l lg:w-[420px]`}
    >
      <div className="flex flex-none items-center gap-1 border-b border-[var(--border)] px-3 py-2">
        {(['itens', 'historico'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setComandaTab(tab)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold ${
              comandaTab === tab ? 'bg-[var(--blue-100)] text-[var(--blue-700)]' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            {tab === 'itens' ? `Itens (${itemCount})` : `Histórico (${history.length})`}
          </button>
        ))}
        {comandaTab === 'itens' && items.length > 1 && (
          <button
            type="button"
            onClick={toggleSort}
            title="Ordem dos itens"
            className="ml-auto rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]"
          >
            {newestFirst ? 'Último → primeiro' : 'Primeiro → último'}
          </button>
        )}
      </div>

      {comandaTab === 'historico' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {history.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-[var(--muted)]">Sem movimentações ainda.</p>
          ) : (
            <ol>
              {history.map((entry) => (
                <li key={entry.id} className="flex gap-3 pb-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${AUDIT_DOT[entry.type] ?? AUDIT_DOT.default}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug font-semibold text-[var(--ink)]">{entry.description}</p>
                    {entry.reason && <p className="text-[12px] text-[var(--ink-soft)]">Motivo: {entry.reason}</p>}
                    <p className="text-[11.5px] text-[var(--muted)]">
                      {formatHour(entry.moment)}
                      {entry.author_name ? ` · ${entry.author_name}` : ''}
                      {entry.requested_by_client ? ' · pedido do cliente' : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 py-12 text-center">
            <p className="text-[14px] font-bold text-[var(--ink)]">Mesa sem itens</p>
            <p className="text-[12.5px] text-[var(--muted)]">Toque nos produtos para lançar.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {sortedItems.map((item) => {
              const held = Boolean(item.print_hold)
              const paid = Boolean(item.is_received)
              const selectable = payItems !== null && !paid && !held
              const checked = selectable && payItems!.includes(item.id)
              return (
                <li
                  key={item.id}
                  onClick={() => selectable && setPayItems((current) => (current ? (checked ? current.filter((id) => id !== item.id) : [...current, item.id]) : current))}
                  className={`flex gap-3 px-4 py-3 ${held ? 'bg-[var(--green-100)]/50' : ''} ${selectable ? 'cursor-pointer hover:bg-[var(--page)]' : ''} ${checked ? '!bg-[var(--blue-100)]' : ''} ${payItems !== null && !selectable ? 'opacity-50' : ''}`}
                >
                  {payItems !== null && (
                    <span
                      className={`mt-1 flex h-5 w-5 flex-none items-center justify-center rounded-md border-2 ${
                        checked ? 'border-[var(--blue-500)] bg-[var(--blue-500)]' : 'border-[var(--border)]'
                      }`}
                    >
                      {checked && <span className="h-2 w-2 rounded-sm bg-white" />}
                    </span>
                  )}
                  <span className="mt-0.5 flex h-7 min-w-7 flex-none items-center justify-center rounded-lg bg-[var(--page)] px-1.5 text-[12.5px] font-bold text-[var(--ink)]">
                    {item.quantity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13.5px] font-semibold leading-snug text-[var(--ink)]">{item.name}</p>
                      <p className="flex-none text-[13.5px] font-bold text-[var(--ink)]">{formatCurrency(item.sub_total)}</p>
                    </div>
                    {item.observation && <p className="mt-0.5 text-[12px] leading-snug text-[var(--ink-soft)]">{item.observation}</p>}
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--muted)]">
                        {held ? (
                          <span className="rounded-full bg-[var(--green-600)] px-2 py-0.5 text-[10.5px] font-bold text-white">NOVO · não enviado</span>
                        ) : paid ? (
                          <span className="rounded-full bg-[var(--green-100)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--green-600)]">PAGO</span>
                        ) : (
                          <span>Enviado</span>
                        )}
                        <span>
                          · {formatHour(item.createdAt)}
                          {item.author_name ? ` · ${firstName(item.author_name)}` : ''}
                        </span>
                        {item.quantity > 1 && <span>· {formatCurrency(item.unit_price)} cada</span>}
                      </span>
                      {payItems !== null ? null : held ? (
                        <Stepper small value={item.quantity} onChange={(value) => changeHeldQuantity(item.id, value)} />
                      ) : paid ? null : (
                        <button
                          type="button"
                          onClick={() => openCancelItem(item.id)}
                          aria-label={`Cancelar ${item.name}`}
                          title="Cancelar item"
                          className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--red-100)] hover:text-[var(--red-500)]"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      )}

      {payItems !== null ? (
        <div className="flex-none border-t border-[var(--border)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-[12.5px] text-[var(--ink-soft)]">Toque nos itens que serão pagos agora. A mesa continua aberta com o resto.</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[14px] font-bold text-[var(--ink)]">
              {chosenToPay.length} {chosenToPay.length === 1 ? 'item' : 'itens'} selecionado{chosenToPay.length === 1 ? '' : 's'}
            </span>
            <span className="text-[22px] font-bold text-[var(--ink)]">{formatCurrency(chosenTotal)}</span>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
            <button
              type="button"
              onClick={() => setPayItems(null)}
              className="rounded-xl border border-[var(--border)] py-3 text-[13px] font-semibold text-[var(--ink-soft)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={chosenToPay.length === 0}
              onClick={async () => {
                if (onBeforeReceive && !(await onBeforeReceive())) return
                setReceiveItemsOpen(true)
              }}
              className="rounded-xl bg-[var(--blue-500)] py-3 text-[14px] font-bold text-white disabled:opacity-45"
            >
              Receber {formatCurrency(chosenTotal)}
            </button>
          </div>
        </div>
      ) : (
      <div className="flex-none border-t border-[var(--border)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="space-y-1 text-[13px]">
          <div className="flex justify-between text-[var(--ink-soft)]">
            <span>Subtotal · {itemCount} {itemCount === 1 ? 'item' : 'itens'}</span>
            <span className="font-semibold text-[var(--ink)]">{formatCurrency(subtotal)}</span>
          </div>
          {deliveryFee > 0 && (
            <div className="flex justify-between text-[var(--ink-soft)]">
              <span>Taxa de entrega</span>
              <span className="font-semibold text-[var(--ink)]">{formatCurrency(deliveryFee)}</span>
            </div>
          )}
          {partialTotal > 0 && (
            <div className="flex justify-between text-[var(--ink-soft)]">
              <span>Já recebido</span>
              <span className="font-semibold text-[var(--green-600)]">- {formatCurrency(partialTotal)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[14px] font-bold text-[var(--ink)]">Total</span>
            <span className="text-[24px] font-bold tracking-tight text-[var(--ink)]">{formatCurrency(receiveTotal)}</span>
          </div>
        </div>

        {printNotice && (
          <p className="mt-2 rounded-lg bg-[var(--red-100)] px-3 py-2 text-[12px] font-medium text-[var(--red-500)]">{printNotice}</p>
        )}

        {heldItems.length > 0 && (
          <button
            type="button"
            onClick={() => void handleSendOrder()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--green-600)] py-3 text-[14px] font-bold text-white transition hover:opacity-90"
          >
            <PrinterIcon className="h-4 w-4" />
            Enviar pedido para a produção ({heldItems.length})
          </button>
        )}

        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handlePrintBill}
            disabled={items.length === 0}
            className="rounded-xl border border-[var(--border)] py-2.5 text-[12.5px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)] disabled:opacity-40"
          >
            Imprimir conta
          </button>
          <button
            type="button"
            onClick={() => void handleReprintOrder()}
            disabled={items.length === 0}
            className="rounded-xl border border-[var(--border)] py-2.5 text-[12.5px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)] disabled:opacity-40"
          >
            Reimprimir pedido
          </button>
          <button
            type="button"
            onClick={() => (ifood ? openIfoodCancel() : setCancelTableOpen(true))}
            disabled={ifood && ifoodFinished}
            className="flex items-center justify-center gap-1 rounded-xl border border-[var(--red-100)] py-2.5 text-[12.5px] font-semibold text-[var(--red-500)] disabled:opacity-40"
          >
            <XCircleIcon className="h-3.5 w-3.5" />
            {ifood ? 'Cancelar pedido' : delivery ? 'Cancelar delivery' : 'Cancelar mesa'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void handleCloseTable()}
          className="mt-2 w-full rounded-xl bg-[var(--blue-500)] py-3.5 text-[15px] font-bold text-white transition hover:bg-[var(--blue-700)]"
        >
          {items.length > 0 && table.sales.length === 0 && receiveTotal > 0 ? `Receber ${formatCurrency(receiveTotal)} e fechar` : 'Fechar mesa'}
        </button>
        {payableItems.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setComandaTab('itens')
              setPayItems([])
            }}
            className="mt-2 w-full rounded-xl py-2 text-[13px] font-semibold text-[var(--blue-700)] hover:bg-[var(--blue-100)]"
          >
            Receber só alguns itens (mesa continua aberta)
          </button>
        )}
      </div>
      )}
    </aside>
  )

  return (
    <div className="flex h-full flex-col bg-[var(--page)]">
      <div className="flex flex-none items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={leaveTable}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Salão
        </button>
        <div className="min-w-0 text-center">
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            title={delivery ? 'Dados do cliente e da entrega' : 'Colocar o nome do cliente'}
            className="group mx-auto flex max-w-full items-center gap-1.5 rounded-lg px-2 hover:bg-[var(--page)]"
          >
            <span className="truncate text-[16px] font-bold text-[var(--ink)]">
              {tableLabel}
              {table.customer_name ? <span className="text-[var(--blue-700)]"> · {table.customer_name}</span> : null}
            </span>
            <span className="flex-none rounded-md bg-[var(--blue-100)] px-1.5 py-0.5 text-[10.5px] font-bold text-[var(--blue-700)]">
              {table.customer_name ? 'editar' : '+ nome'}
            </span>
          </button>
          <p className="flex flex-wrap items-center justify-center gap-x-2 text-[11.5px] text-[var(--muted)]">
            <span className="flex items-center gap-1">
              <ClockIcon className="h-3 w-3" />
              chegou {formatHour(table.opened_at)}
            </span>
            <span>· {formatMinutes(minutesInHouse)} de casa</span>
            {items.length > 0 && (
              <span className={idle ? 'rounded-full bg-[var(--red-500)] px-2 font-bold text-white' : ''}>
                · {idle ? '⚠ ' : ''}
                {formatMinutes(minutesWithoutOrder)} sem pedir
              </span>
            )}
          </p>
        </div>
        <p className="min-w-[72px] text-right text-[15px] font-bold text-[var(--ink)]">{formatCurrency(receiveTotal)}</p>
      </div>

      {manualDelivery && (
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="flex flex-none items-center justify-between gap-3 bg-violet-100 px-4 py-2 text-left text-violet-800 hover:bg-violet-200/70"
        >
          <span className="min-w-0 text-[12.5px]">
            <b>Entrega:</b> {table.delivery_address || 'sem endereço'}
            {table.customer_phone ? ` · ${table.customer_phone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')}` : ''}
          </span>
          <span className="flex-none text-[12px] font-bold">Taxa {formatCurrency(table.delivery_fee ?? 0)} · editar</span>
        </button>
      )}

      {delivery && table.delivery_order && (
        <div className="flex flex-none flex-col">
          <div className="flex items-center justify-between gap-2 bg-violet-100 px-4 py-2 text-violet-800">
            <span className="text-[12.5px] font-semibold">
              {table.delivery_order.status === 'ready_for_pickup' && table.delivery_order.fulfillment_type !== 'pickup'
                ? 'Pedido pronto — aguardando saída'
                : DELIVERY_STATUS_LABELS[table.delivery_order.status] ?? table.delivery_order.status}
            </span>
            {table.delivery_order.status === 'pending' && (
              <button type="button" disabled={deliveryBusy} onClick={() => advanceDelivery('confirmed')} className="rounded-lg bg-violet-700 px-3 py-1 text-[12px] font-bold text-white disabled:opacity-60">
                Aceitar pedido
              </button>
            )}
            {table.delivery_order.status === 'confirmed' && (
              <button type="button" disabled={deliveryBusy} onClick={() => advanceDelivery('preparing')} className="rounded-lg bg-violet-700 px-3 py-1 text-[12px] font-bold text-white disabled:opacity-60">
                Enviar para cozinha
              </button>
            )}
            {table.delivery_order.status === 'preparing' && (
              <button
                type="button"
                disabled={deliveryBusy}
                onClick={() =>
                  advanceDelivery(
                    table.delivery_order?.fulfillment_type === 'pickup' || ifood ? 'ready_for_pickup' : 'out_for_delivery'
                  )
                }
                className="rounded-lg bg-violet-700 px-3 py-1 text-[12px] font-bold text-white disabled:opacity-60"
              >
                {table.delivery_order.fulfillment_type === 'pickup'
                  ? 'Pronto para retirada'
                  : ifood
                    ? 'Pedido pronto'
                    : 'Saiu para entrega'}
              </button>
            )}
            {ifood &&
              table.delivery_order.fulfillment_type !== 'pickup' &&
              (table.delivery_order.status === 'confirmed' || table.delivery_order.status === 'preparing') && (
                <button
                  type="button"
                  disabled={deliveryBusy}
                  onClick={() => advanceDelivery('out_for_delivery')}
                  className="rounded-lg border border-violet-700 px-3 py-1 text-[12px] font-bold text-violet-700 disabled:opacity-60"
                >
                  Despachar direto
                </button>
              )}
            {table.delivery_order.status === 'ready_for_pickup' && table.delivery_order.fulfillment_type !== 'pickup' && (
              <button type="button" disabled={deliveryBusy} onClick={() => advanceDelivery('out_for_delivery')} className="rounded-lg bg-violet-700 px-3 py-1 text-[12px] font-bold text-white disabled:opacity-60">
                Saiu para entrega
              </button>
            )}
          </div>
          {deliveryError && (
            <p className="bg-[var(--red-100)] px-4 py-2 text-[12.5px] font-medium text-[var(--red-500)]">{deliveryError}</p>
          )}
        </div>
      )}

      {ifood && table.delivery_order && (
        <div className="flex flex-none items-center justify-between gap-3 bg-red-50 px-4 py-2 text-red-700">
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold">
              iFood · Pedido nº {table.delivery_order.external_display_id || '—'}
            </p>
            {table.delivery_order.external_order_id && (
              <p className="break-all font-mono text-[11px]">ID {table.delivery_order.external_order_id}</p>
            )}
          </div>
          {table.delivery_order.external_order_id && (
            <button
              type="button"
              onClick={copyIfoodId}
              className="flex flex-none items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-[11.5px] font-semibold"
            >
              <CopyIcon className="h-3.5 w-3.5" />
              {copiedIfoodId ? 'Copiado' : 'Copiar ID'}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-none gap-1 border-b border-[var(--border)] bg-[var(--surface)] p-1.5 md:hidden">
        {(['menu', 'comanda'] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => setMobileView(view)}
            className={`flex-1 rounded-lg py-2 text-[13px] font-bold ${
              mobileView === view ? 'bg-[var(--blue-100)] text-[var(--blue-700)]' : 'text-[var(--ink-soft)]'
            }`}
          >
            {view === 'menu' ? 'Cardápio' : `Comanda (${itemCount})`}
          </button>
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {menuPanel}
        {comandaPanel}
        {mobileView === 'menu' && items.length > 0 && (
          <button
            type="button"
            onClick={() => setMobileView('comanda')}
            className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-2xl bg-[var(--blue-500)] px-4 py-3.5 text-white shadow-xl md:hidden"
          >
            <span className="text-[14px] font-bold">
              Ver comanda · {itemCount} {itemCount === 1 ? 'item' : 'itens'}
              {heldItems.length > 0 ? ` (${heldItems.length} novo${heldItems.length === 1 ? '' : 's'})` : ''}
            </span>
            <span className="text-[15px] font-bold">{formatCurrency(receiveTotal)}</span>
          </button>
        )}
      </div>

      <PaymentModal
        open={receiveItemsOpen}
        total={chosenTotal}
        title={`Receber ${chosenToPay.length} ${chosenToPay.length === 1 ? 'item' : 'itens'} · ${tableLabel}`}
        confirmLabel="Receber itens"
        acquirerStorageKey={acquirerStorageKey}
        onClose={() => setReceiveItemsOpen(false)}
        onConfirm={(lines, change) => void confirmReceiveItems(lines, change)}
      />

      {infoOpen && (
        <TableInfoModal
          delivery={manualDelivery}
          title={manualDelivery ? `Dados do ${tableLabel}` : `Identificar ${tableLabel}`}
          initial={{
            customer_name: table.customer_name ?? '',
            customer_phone: table.customer_phone ?? '',
            delivery_address: table.delivery_address ?? '',
            delivery_fee: table.delivery_fee ?? 0,
          }}
          onClose={() => setInfoOpen(false)}
          onConfirm={saveInfo}
        />
      )}

      {optionsFor && <ItemOptionsModal product={optionsFor.product} onClose={() => setOptionsFor(null)} onConfirm={confirmOptions} />}

      {cancelItemOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCancelItemOpen(false)}>
          <div className="w-full max-w-[380px] rounded-2xl bg-[var(--surface)] p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[14px] font-bold text-[var(--ink)]">Cancelar item</h2>
            <textarea
              value={cancelItemReason}
              onChange={(event) => setCancelItemReason(event.target.value)}
              placeholder="Motivo"
              className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[13px] text-[var(--ink)]"
              rows={3}
            />
            <label className="mt-2 flex items-center gap-2 text-[12.5px] text-[var(--ink-soft)]">
              <input type="checkbox" checked={cancelItemByClient} onChange={(event) => setCancelItemByClient(event.target.checked)} />
              Solicitado pelo cliente?
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCancelItemOpen(false)} className="rounded-xl px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]">
                Voltar
              </button>
              <button type="button" onClick={confirmCancelItem} disabled={!cancelItemReason.trim()} className="rounded-xl bg-[var(--red-500)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {ifoodCancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !ifoodCancelLoading && setIfoodCancelOpen(false)}>
          <div className="w-full max-w-[420px] rounded-2xl bg-[var(--surface)] p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[14px] font-bold text-[var(--ink)]">
              Cancelar pedido iFood {table.delivery_order?.external_display_id ? `nº ${table.delivery_order.external_display_id}` : ''}
            </h2>
            <p className="mt-1 text-[12px] text-[var(--muted)]">Escolha o motivo — o cancelamento é enviado pro iFood na hora.</p>

            {ifoodReasons === null && !ifoodCancelError && (
              <p className="mt-4 text-[13px] text-[var(--ink-soft)]">Carregando motivos…</p>
            )}

            {ifoodReasons && (
              <div className="mt-3 flex max-h-[280px] flex-col gap-1.5 overflow-y-auto">
                {ifoodReasons.map((reason) => (
                  <label
                    key={reason.code}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px] ${
                      ifoodReasonCode === reason.code
                        ? 'border-[var(--red-500)] bg-[var(--red-100)] text-[var(--red-500)]'
                        : 'border-[var(--border)] text-[var(--ink)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ifood-cancel-reason"
                      checked={ifoodReasonCode === reason.code}
                      onChange={() => setIfoodReasonCode(reason.code)}
                    />
                    {reason.description}
                  </label>
                ))}
              </div>
            )}

            {ifoodCancelError && (
              <p className="mt-3 rounded-xl bg-[var(--red-100)] px-3 py-2 text-[12.5px] font-medium text-[var(--red-500)]">{ifoodCancelError}</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setIfoodCancelOpen(false)} disabled={ifoodCancelLoading} className="rounded-xl px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]">
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmIfoodCancel}
                disabled={!ifoodReasonCode || ifoodCancelLoading}
                className="rounded-xl bg-[var(--red-500)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {ifoodCancelLoading ? 'Cancelando…' : 'Cancelar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCancelTableOpen(false)}>
          <div className="w-full max-w-[380px] rounded-2xl bg-[var(--surface)] p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[14px] font-bold text-[var(--ink)]">Cancelar mesa</h2>
            <textarea
              value={cancelTableReason}
              onChange={(event) => setCancelTableReason(event.target.value)}
              placeholder="Motivo"
              className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[13px] text-[var(--ink)]"
              rows={3}
            />
            <label className="mt-2 flex items-center gap-2 text-[12.5px] text-[var(--ink-soft)]">
              <input type="checkbox" checked={cancelTableByClient} onChange={(event) => setCancelTableByClient(event.target.checked)} />
              Solicitado pelo cliente?
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCancelTableOpen(false)} className="rounded-xl px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]">
                Voltar
              </button>
              <button type="button" onClick={confirmCancelTable} disabled={!cancelTableReason.trim()} className="rounded-xl bg-[var(--red-500)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <PaymentModal
        open={receiveTotalOpen}
        total={receiveTotal}
        title={`Receber ${tableLabel}`}
        confirmLabel="Receber e fechar"
        acquirerStorageKey={acquirerStorageKey}
        onClose={() => setReceiveTotalOpen(false)}
        onConfirm={(lines, change) => void confirmReceiveTotal(lines, change)}
      />
    </div>
  )
}
