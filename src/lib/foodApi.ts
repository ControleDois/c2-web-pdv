import { apiGet, apiPost, apiPut } from './api'
import type { FoodTable } from './foodTypes'

export interface FoodSyncPayload {
  device_id: string
  id: string
  companyId: string
  number: number
  status: string
  opened_at: string
  closed_at: string | null
  items: unknown[]
  orders: unknown[]
  partials: unknown[]
  sales: unknown[]
  audit: unknown[]
}

export function syncTable(token: string, companyId: string, payload: FoodSyncPayload) {
  return apiPost<{ table?: unknown }>(`/food/sync`, payload, token, { companyId })
}

export function pullTables(token: string, companyId: string) {
  return apiGet<unknown[]>('/food/sync/pull', { companyId }, token)
}

export function updateDeliveryOrderStatus(token: string, orderId: string, status: string) {
  return apiPut<unknown>(`/food/delivery-orders/${orderId}/status`, { status }, token)
}

export interface IfoodCancellationReason {
  code: string
  description: string
}

export function fetchIfoodCancellationReasons(token: string, orderId: string) {
  return apiGet<IfoodCancellationReason[]>(`/food/delivery-orders/${orderId}/ifood-cancellation-reasons`, {}, token)
}

export function cancelIfoodOrder(token: string, orderId: string, payload: { cancellation_code: string; reason: string }) {
  return apiPost<unknown>(`/food/delivery-orders/${orderId}/ifood-cancel`, payload, token)
}

// Converte o formato cru devolvido pelo servidor (preloads Lucid, snake_case)
// pro formato local (FoodTable) — mesmo espírito do normalizeRemoteTable do
// Angular: usa os itens ativos pra decidir open_empty/open_with_items quando
// o status não é claramente closed/canceled.
export function normalizeRemoteTable(raw: any): FoodTable {
  const items = (raw.items || []).map((item: any) => ({
    id: item.id,
    companyId: raw.company_id || raw.companyId,
    user_id: item.user_id ?? null,
    synchronized: 'S' as const,
    createdAt: item.created_at || item.createdAt || new Date().toISOString(),
    updatedAt: item.updated_at || item.updatedAt || new Date().toISOString(),
    deletedAt: item.deleted_at || item.deletedAt || null,
    item: Number(item.item || 0),
    product_id: item.product_id,
    code: item.product_code || '',
    product_code: item.product_code || '',
    name: item.name || '',
    quantity: Number(item.quantity || 0),
    unit_value: Number(item.unit_price || 0),
    unit_price: Number(item.unit_price || 0),
    sub_total: Number(item.total || 0),
    total: Number(item.total || 0),
    removed: Boolean(item.is_removed),
    selected: false,
    pending_print: Boolean(item.pending_print),
    observation: item.observation || undefined,
    author: item.user_id || '',
    author_name: item.author_name || '',
  }))

  const activeItemsCount = items.filter((item: any) => !item.removed).length
  let status: FoodTable['status']
  if (raw.status === 2 || raw.status === '2') status = 'closed'
  else if (raw.status === 3 || raw.status === '3') status = 'canceled'
  else status = activeItemsCount > 0 ? 'open_with_items' : 'open_empty'

  return {
    id: raw.id,
    companyId: raw.company_id || raw.companyId,
    user_id: raw.user_id ?? null,
    synchronized: 'S',
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
    deletedAt: raw.deleted_at || raw.deletedAt || null,
    number: Number(raw.number || 0),
    status,
    opened_at: raw.opened_at || new Date().toISOString(),
    closed_at: raw.closed_at || null,
    last_order_at: raw.last_order_at || null,
    items,
    orders: (raw.orders || []).map((order: any) => ({
      id: order.id,
      companyId: raw.company_id || raw.companyId,
      user_id: order.user_id ?? null,
      synchronized: 'S',
      createdAt: order.created_at || new Date().toISOString(),
      updatedAt: order.updated_at || new Date().toISOString(),
      deletedAt: order.deleted_at || null,
      moment: order.moment || order.created_at || new Date().toISOString(),
      author: order.user_id || '',
      author_name: order.author_name || '',
      items: [],
    })),
    partials: (raw.partial_receipts || raw.partials || []).map((partial: any) => ({
      id: partial.id,
      companyId: raw.company_id || raw.companyId,
      user_id: partial.user_id ?? null,
      synchronized: 'S',
      createdAt: partial.created_at || new Date().toISOString(),
      updatedAt: partial.updated_at || new Date().toISOString(),
      deletedAt: partial.deleted_at || null,
      moment: partial.moment || partial.created_at || new Date().toISOString(),
      description: partial.description || '',
      received: Number(partial.received_amount || 0),
      author: partial.user_id || '',
      author_name: partial.author_name || '',
      item_ids: [],
      payments: partial.payments || [],
    })),
    sales: (raw.sales || []).map((sale: any) => ({
      id: sale.id,
      companyId: raw.company_id || raw.companyId,
      user_id: sale.user_id ?? null,
      synchronized: 'S',
      createdAt: sale.created_at || new Date().toISOString(),
      updatedAt: sale.updated_at || new Date().toISOString(),
      deletedAt: sale.deleted_at || null,
      moment: sale.moment || sale.created_at || new Date().toISOString(),
      table_number: Number(raw.number || 0),
      subtotal: Number(sale.subtotal || 0),
      partial: Number(sale.partial || 0),
      total: Number(sale.total || 0),
      author: sale.user_id || '',
      author_name: sale.author_name || '',
      payments: sale.payments || [],
    })),
    audit: (raw.audits || raw.audit || []).map((audit: any) => ({
      id: audit.id,
      companyId: raw.company_id || raw.companyId,
      user_id: audit.user_id ?? null,
      synchronized: 'S',
      createdAt: audit.created_at || new Date().toISOString(),
      updatedAt: audit.updated_at || new Date().toISOString(),
      deletedAt: audit.deleted_at || null,
      moment: audit.moment || audit.created_at || new Date().toISOString(),
      description: audit.history || audit.description || '',
      reason: audit.reason || '',
      author: audit.user_id || '',
      author_name: audit.author_name || '',
      type: (audit.status || audit.type || 'default') as any,
      requested_by_client: Boolean(audit.requested_by_client),
    })),
    delivery_order: raw.delivery_order || null,
  }
}
