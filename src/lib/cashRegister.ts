import { apiGet, apiPost } from './api'

export interface CashRegisterSessionRecord {
  id: string
  code?: number
  companyId?: string
  managerPeopleId?: string
  operatorPeopleId?: string
  opening_amount?: number
  openingAmount?: number
  closingAmount?: number | null
  opened_at?: string
  openedAt?: string
  closedAt?: string | null
  status?: number
  note?: string | null
  manager?: { id: string; name: string } | null
  operator?: { id: string; name: string } | null
  [key: string]: unknown
}

export interface CashRegisterStatus {
  enabled: boolean
  acceptedPaymentMethods: number[]
  session: CashRegisterSessionRecord | null
}

export const FORM_PAYMENT_LABELS: Record<number, string> = {
  0: 'Boleto Bancário',
  1: 'Cartão de Crédito',
  2: 'Cartão de Débito',
  3: 'Carteira Digital',
  4: 'Cashback',
  5: 'Cheque',
  6: 'Crédito da Loja',
  7: 'Crédito Virtual',
  8: 'Depósito Bancário',
  9: 'Dinheiro',
  10: 'PIX',
  11: 'Programa de Fidelidade',
  12: 'Transferência Bancária',
  13: 'Vale Alimentação',
  14: 'Vale Combustível',
  15: 'Vale Presente',
  16: 'Vale Refeição',
}

export function fetchCashRegisterStatus(token: string, companyId: string) {
  return apiGet<CashRegisterStatus>('/cash-register-session/current', { companyId }, token)
}

export interface CashRegisterMovementSummary {
  bills: {
    id: string
    code?: number
    name?: string
    bill_value?: number
    amount?: number
    role?: number
    form_payment?: number
    date_received?: string
    people?: { id: string; name: string } | null
  }[]
  byPayment: { formPayment: number; amount: number }[]
  total: number
}

export function fetchCashRegisterMovements(token: string, sessionId: string) {
  return apiGet<{
    session: CashRegisterSessionRecord
    movements: CashRegisterMovementSummary
    closingPayments: { formPayment: number; amount: number }[]
    comparison: { expectedAmount: number; declaredAmount: number; differenceAmount: number }
  }>(`/cash-register-session/${sessionId}/movements`, undefined, token)
}

export interface OpenCashRegisterPayload {
  companyId: string
  managerPeopleId: string
  managerPassword: string
  operatorPeopleId: string
  operatorPassword: string
  openingAmount: number
  note?: string
}

export function openCashRegister(token: string, payload: OpenCashRegisterPayload) {
  return apiPost<CashRegisterSessionRecord>(
    '/cash-register-session/open',
    {
      company_id: payload.companyId,
      manager_people_id: payload.managerPeopleId,
      manager_password: payload.managerPassword,
      operator_people_id: payload.operatorPeopleId,
      operator_password: payload.operatorPassword,
      opening_amount: payload.openingAmount,
      note: payload.note,
    },
    token
  )
}

export interface CloseCashRegisterPayload {
  managerPassword: string
  operatorPassword: string
  closingPayments: { formPayment: number; amount: number }[]
  note?: string
}

export function closeCashRegister(token: string, sessionId: string, payload: CloseCashRegisterPayload) {
  return apiPost<CashRegisterSessionRecord>(
    `/cash-register-session/close/${sessionId}`,
    {
      manager_password: payload.managerPassword,
      operator_password: payload.operatorPassword,
      closing_payments: payload.closingPayments.map((item) => ({
        form_payment: item.formPayment,
        amount: item.amount,
      })),
      note: payload.note,
    },
    token
  )
}
