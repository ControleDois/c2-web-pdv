import { apiGet, apiPost } from './api'

// Crediário (form_payment 6 = Crédito da Loja): a venda vira contas a receber em aberto do cliente.
export const CREDIT_FORM_PAYMENT = 6

export interface CreditUsage {
  people_id: string
  name: string | null
  limit: number
  used: number
  available: number
  overdue: number
  overdue_count: number
}

export function fetchCreditUsage(token: string, companyId: string, peopleId: string) {
  return apiGet<CreditUsage>(`/pdv/credit/${peopleId}`, { companyId }, token)
}

export function checkCreditSale(token: string, companyId: string, payload: { peopleId: string; amount: number; password?: string }) {
  return apiPost<{ ok: boolean }>('/pdv/credit/check', { companyId, ...payload }, token)
}

export function setCreditPassword(token: string, companyId: string, password: string) {
  return apiPost<{ password_set: boolean }>('/pdv/credit/password', { companyId, password }, token)
}

// Vencimentos mensais a partir do primeiro (mesmo dia nos meses seguintes; dia 31 vira o último do mês).
export function creditDueDates(firstDue: string, installments: number): string[] {
  const [year, month, day] = firstDue.split('-').map(Number)
  return Array.from({ length: installments }, (_, index) => {
    const target = new Date(Date.UTC(year, month - 1 + index, 1))
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
    target.setUTCDate(Math.min(day, lastDay))
    return target.toISOString().slice(0, 10)
  })
}

// Divide o valor em parcelas iguais; os centavos que sobram vão na primeira.
export function splitInstallments(amount: number, installments: number): number[] {
  const cents = Math.round(amount * 100)
  const base = Math.floor(cents / installments)
  const rest = cents - base * installments
  return Array.from({ length: installments }, (_, index) => (base + (index === 0 ? rest : 0)) / 100)
}
