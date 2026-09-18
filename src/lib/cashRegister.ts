import { apiGet } from './api'

export interface CashRegisterSessionRecord {
  id: string
  opening_amount?: number
  opened_at?: string
  [key: string]: unknown
}

export interface CashRegisterStatus {
  enabled: boolean
  acceptedPaymentMethods: number[]
  session: CashRegisterSessionRecord | null
}

export function fetchCashRegisterStatus(token: string, companyId: string) {
  return apiGet<CashRegisterStatus>('/cash-register-session/current', { companyId }, token)
}
