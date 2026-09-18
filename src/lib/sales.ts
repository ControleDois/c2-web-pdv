import { apiPost } from './api'

export interface SaleProductPayload {
  product_id: string
  description: string
  amount: number
  cost_value: number
  subtotal: number
}

export interface SalePlotPayload {
  portion: number
  form_payment: number
  date_due: string
  amount: number
  bill_value: number
  change?: number
  note?: string
  status: number
}

export interface CreateSalePayload {
  companyId: string
  peopleId: string
  userId: string
  categoryId?: string
  bankAccountId?: string
  role: number
  status: number
  date_sale: string
  amount: number
  net_total: number
  note?: string
  form_payment: number
  payment_terms: number
  products: SaleProductPayload[]
  plots: SalePlotPayload[]
}

export interface SaleRecord {
  id: string
  code?: number
  [key: string]: unknown
}

export function createSale(token: string, payload: CreateSalePayload) {
  return apiPost<SaleRecord>('/sale', payload, token)
}
