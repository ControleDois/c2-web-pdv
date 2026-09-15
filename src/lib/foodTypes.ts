// Espelha o modelo local usado pelo PDV Food do Angular (c2-web-client) —
// um único documento por mesa, tudo aninhado (sem stores separadas pra
// orders/items/partials/sales/audit).

export type TableStatus = 'open_empty' | 'open_with_items' | 'closed' | 'canceled'

export interface FoodBaseLocal {
  id: string
  companyId: string
  user_id: string | null
  synchronized: 'S' | 'N'
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface FoodTableItem extends FoodBaseLocal {
  item: number
  product_id: string
  code: string
  product_code: string
  name: string
  quantity: number
  unit_value: number
  unit_price: number
  sub_total: number
  total: number
  removed: boolean
  selected: boolean
  pending_print: boolean
  observation?: string
  author: string
  author_name: string
}

export interface FoodTableOrderItemRef {
  item: number
  code: string
  product_code: string
  name: string
  quantity: number
}

export interface FoodTableOrder extends FoodBaseLocal {
  moment: string
  author: string
  author_name: string
  items: FoodTableOrderItemRef[]
}

export interface FoodTablePayment {
  form_payment: number
  amount: number
}

export interface FoodTablePartial extends FoodBaseLocal {
  moment: string
  description: string
  received: number
  author: string
  author_name: string
  item_ids: string[]
  payments?: FoodTablePayment[]
}

export interface FoodTableSale extends FoodBaseLocal {
  moment: string
  table_number: number
  subtotal: number
  partial: number
  total: number
  author: string
  author_name: string
  payment_method?: number
  payments?: FoodTablePayment[]
}

export type FoodAuditType = 'default' | 'success' | 'danger' | 'warning'

export interface FoodAudit extends FoodBaseLocal {
  moment: string
  description: string
  reason: string
  author: string
  author_name: string
  type: FoodAuditType
  requested_by_client: boolean
}

export type DeliveryOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'ready_for_pickup'
  | 'completed'
  | 'canceled'

export interface FoodTableDeliveryOrder {
  id: string
  fulfillment_type: string
  payment_method: string
  status: DeliveryOrderStatus
  delivery_fee: number
  total: number
}

export interface FoodTable extends FoodBaseLocal {
  number: number
  status: TableStatus
  opened_at: string
  closed_at: string | null
  last_order_at: string | null
  items: FoodTableItem[]
  orders: FoodTableOrder[]
  partials: FoodTablePartial[]
  sales: FoodTableSale[]
  audit: FoodAudit[]
  delivery_order?: FoodTableDeliveryOrder | null
}

export const DELIVERY_TABLE_MIN = 9000
export const DELIVERY_TABLE_MAX = 9999

export function isDeliveryTable(table: FoodTable): boolean {
  return Boolean(table.delivery_order) || (table.number >= DELIVERY_TABLE_MIN && table.number <= DELIVERY_TABLE_MAX)
}

export function activeItems(table: FoodTable): FoodTableItem[] {
  return table.items.filter((item) => !item.removed)
}

export const PAYMENT_METHODS: { value: number; label: string }[] = [
  { value: 9, label: 'Dinheiro' },
  { value: 2, label: 'Débito' },
  { value: 1, label: 'Crédito' },
  { value: 10, label: 'PIX' },
]

export function newLocalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
