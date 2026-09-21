import { useEffect, useRef, useState } from 'react'
import type { FoodTable, FoodTableItem, FoodTablePayment } from '../../lib/foodTypes'
import { activeItems, isDeliveryTable, isIfoodOrder, newLocalId, PAYMENT_METHODS } from '../../lib/foodTypes'
import type { IfoodCancellationReason } from '../../lib/foodApi'
import { ApiError } from '../../lib/api'
import { filterProductBy, type LocalProduct } from '../../lib/db'
import { formatCurrency } from '../../lib/format'
import { ChevronLeftIcon, CopyIcon, TrashIcon, XCircleIcon } from '../icons'

interface TableDetailProps {
  table: FoodTable
  authorId: string
  authorName: string
  onBack: () => void
  onSave: (table: FoodTable) => void
  onAdvanceDeliveryStatus: (status: string) => Promise<void>
  onLoadIfoodCancellationReasons: () => Promise<IfoodCancellationReason[]>
  onCancelIfoodOrder: (code: string, reason: string) => Promise<void>
}

type InputMode = 'product' | 'quantity'

function nowIso(): string {
  return new Date().toISOString()
}

function parseQuantity(value: string): number {
  const normalized = value.replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) && num > 0 ? num : 1
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
}: TableDetailProps) {
  const [inputMode, setInputMode] = useState<InputMode>('product')
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<LocalProduct | null>(null)
  const [matches, setMatches] = useState<LocalProduct[]>([])
  const [quantityInput, setQuantityInput] = useState('1')
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
  const [receivePayments, setReceivePayments] = useState<FoodTablePayment[]>([])
  const [receiveMethod, setReceiveMethod] = useState(9)
  const [receiveAmount, setReceiveAmount] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
  }, [inputMode])

  useEffect(() => {
    if (inputMode !== 'product') return
    if (!search.trim()) {
      setMatches([])
      setSelectedProduct(null)
      return
    }
    const timeout = setTimeout(() => {
      filterProductBy(search.trim()).then((results) => {
        setMatches(results)
        setSelectedProduct(results[0] ?? null)
      })
    }, 100)
    return () => clearTimeout(timeout)
  }, [search, inputMode])

  const items = activeItems(table)
  const subtotal = items.reduce((sum, item) => sum + item.sub_total, 0)
  const partialTotal = table.partials.reduce((sum, partial) => sum + partial.received, 0)
  const deliveryFee = table.delivery_order?.delivery_fee ?? 0
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

  function handleAddProduct(product: LocalProduct, quantity: number) {
    const next: FoodTable = { ...table, items: [...table.items], orders: [...table.orders], audit: [...table.audit] }
    const unitValue = Number(product.sale_value || 0)
    const itemNumber = next.items.length + 1
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
      author: authorId,
      author_name: authorName,
    }
    next.items.push(item)
    next.orders.push({
      id: newLocalId(),
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

    const wasClosedReopen = table.status === 'closed'
    if (wasClosedReopen) {
      pushAudit(next, 'REABERTURA POR NOVO LANÇAMENTO', 'warning')
    }
    pushAudit(next, `LANÇOU ${quantity} ${product.name}`, 'default')

    next.status = 'open_with_items'
    next.last_order_at = nowIso()
    onSave(next)
  }

  function handleProductSubmit() {
    if (!search.trim()) {
      onBack()
      return
    }
    if (!selectedProduct) {
      setSearch('')
      return
    }
    setInputMode('quantity')
    setQuantityInput('1')
  }

  function handleQuantitySubmit() {
    if (!selectedProduct) return
    const quantity = parseQuantity(quantityInput)
    handleAddProduct(selectedProduct, quantity)
    setSearch('')
    setSelectedProduct(null)
    setMatches([])
    setInputMode('product')
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

  function openReceiveTotal() {
    setReceivePayments([])
    setReceiveMethod(9)
    setReceiveAmount(receiveTotal.toFixed(2))
    setReceiveTotalOpen(true)
  }

  function handleCloseTable() {
    if (items.length > 0 && table.sales.length === 0) {
      openReceiveTotal()
      return
    }
    const next: FoodTable = { ...table, items: table.items.map((i) => ({ ...i, selected: false, pending_print: false })), audit: [...table.audit], status: 'closed', closed_at: nowIso() }
    pushAudit(next, 'FECHAMENTO DE MESA', 'success')
    onSave(next)
    onBack()
  }

  const receivePaymentsTotal = receivePayments.reduce((sum, p) => sum + p.amount, 0)
  const receiveRemaining = Math.max(0, Math.round((receiveTotal - receivePaymentsTotal) * 100) / 100)

  function addReceivePayment() {
    const amount = Number(receiveAmount.replace(',', '.'))
    if (!amount || amount <= 0 || amount > receiveRemaining + 0.009) return
    setReceivePayments((prev) => [...prev, { form_payment: receiveMethod, amount }])
    setReceiveAmount(Math.max(0, receiveRemaining - amount).toFixed(2))
  }

  function confirmReceiveTotal() {
    if (Math.abs(receivePaymentsTotal - receiveTotal) > 0.009) return
    const next: FoodTable = { ...table, sales: [...table.sales], partials: [...table.partials], items: table.items.map((i) => ({ ...i, selected: false, pending_print: false })), audit: [...table.audit] }
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
      payment_method: receivePayments[receivePayments.length - 1]?.form_payment ?? receiveMethod,
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
    setReceiveTotalOpen(false)
    onSave(next)
    onBack()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-[12.5px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]">
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Sair
        </button>
        <p className="text-[14px] font-bold text-[var(--ink)]">
          {delivery ? `Delivery ${table.number}` : `Mesa ${table.number}`}
        </p>
        <div className="w-10" />
      </div>

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

      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-[var(--muted)]">Nenhum item lançado ainda.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedItemId(item.id)}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-left ${
                  selectedItemId === item.id ? 'bg-[var(--blue-100)]' : item.pending_print ? 'bg-[var(--green-100)]' : 'bg-[var(--surface)] border border-[var(--border)]'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-[var(--ink)]">
                    {item.item}. {item.quantity}x {item.name}
                  </span>
                  {item.observation && <span className="block text-[11.5px] text-[var(--muted)]">{item.observation}</span>}
                </span>
                <span className="flex-none text-[13.5px] font-bold text-[var(--ink)]">{formatCurrency(item.sub_total)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-none border-t border-[var(--border)] bg-[var(--surface)] p-3">
        {inputMode === 'product' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              handleProductSubmit()
            }}
            className="flex flex-col gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Código, código de barras ou nome do produto"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-300)]"
            />
            {search.trim() && (
              <p className="text-[12px] text-[var(--muted)]">
                {selectedProduct ? `${selectedProduct.name} — ${formatCurrency(Number(selectedProduct.sale_value || 0))}` : matches.length === 0 ? 'Produto não encontrado' : ''}
              </p>
            )}
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              handleQuantitySubmit()
            }}
            className="flex items-center gap-2"
          >
            <span className="text-[13px] font-semibold text-[var(--ink-soft)]">{selectedProduct?.name}</span>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              className="w-24 rounded-xl border border-[var(--border)] bg-[var(--page)] px-3.5 py-2.5 text-center text-[14px] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-300)]"
            />
            <button type="submit" className="rounded-xl bg-[var(--blue-500)] px-4 py-2.5 text-[13.5px] font-bold text-white">
              Lançar
            </button>
          </form>
        )}

        <div className="mt-3 flex items-center justify-between text-[13px]">
          <span className="text-[var(--muted)]">Subtotal</span>
          <span className="font-bold text-[var(--ink)]">{formatCurrency(subtotal)}</span>
        </div>
        {partialTotal > 0 && (
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[var(--muted)]">Já recebido</span>
            <span className="font-semibold text-[var(--green-600)]">{formatCurrency(partialTotal)}</span>
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => openCancelItem()} disabled={items.length === 0} className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] py-2.5 text-[12.5px] font-semibold text-[var(--ink-soft)] disabled:opacity-40">
            <TrashIcon className="h-3.5 w-3.5" />
            Cancelar item
          </button>
          <button
            type="button"
            onClick={() => (ifood ? openIfoodCancel() : setCancelTableOpen(true))}
            disabled={ifood && ifoodFinished}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--red-100)] py-2.5 text-[12.5px] font-semibold text-[var(--red-500)] disabled:opacity-40"
          >
            <XCircleIcon className="h-3.5 w-3.5" />
            {ifood ? 'Cancelar pedido' : 'Cancelar mesa'}
          </button>
          <button type="button" onClick={handleCloseTable} className="rounded-xl bg-[var(--blue-500)] py-2.5 text-[12.5px] font-bold text-white">
            Fechar mesa
          </button>
        </div>
      </div>

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

      {receiveTotalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReceiveTotalOpen(false)}>
          <div className="w-full max-w-[420px] rounded-2xl bg-[var(--surface)] p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[14px] font-bold text-[var(--ink)]">Receber total</h2>
            <p className="mt-1 text-[13px] text-[var(--ink-soft)]">A receber: {formatCurrency(receiveTotal)}</p>

            <div className="mt-3 flex items-center gap-2">
              <select
                value={receiveMethod}
                onChange={(event) => setReceiveMethod(Number(event.target.value))}
                className="rounded-xl border border-[var(--border)] bg-[var(--page)] px-2.5 py-2 text-[13px] text-[var(--ink)]"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={receiveAmount}
                onChange={(event) => setReceiveAmount(event.target.value)}
                className="w-28 rounded-xl border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[13px] text-[var(--ink)]"
              />
              <button type="button" onClick={addReceivePayment} className="rounded-xl bg-[var(--blue-500)] px-3 py-2 text-[12.5px] font-bold text-white">
                Adicionar
              </button>
            </div>

            {receivePayments.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {receivePayments.map((payment, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg bg-[var(--page)] px-3 py-1.5 text-[12.5px]">
                    <span>{PAYMENT_METHODS.find((m) => m.value === payment.form_payment)?.label}</span>
                    <span className="flex items-center gap-2">
                      {formatCurrency(payment.amount)}
                      <button type="button" onClick={() => setReceivePayments((prev) => prev.filter((_, i) => i !== index))} className="text-[var(--red-500)]">
                        ×
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className={`mt-3 text-[13px] font-bold ${receiveRemaining > 0 ? 'text-[var(--amber-500)]' : 'text-[var(--green-600)]'}`}>
              Restante: {formatCurrency(receiveRemaining)}
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setReceiveTotalOpen(false)} className="rounded-xl px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]">
                Voltar
              </button>
              <button type="button" onClick={confirmReceiveTotal} disabled={receiveRemaining > 0} className="rounded-xl bg-[var(--blue-500)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
