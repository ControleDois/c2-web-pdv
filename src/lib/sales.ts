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
  // Dados da maquininha (sem TEF) que seguem na NFC-e.
  card_brand?: string
  payment_authorization?: string
  card_acquirer_cnpj?: string
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
  consumer_document?: string
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
