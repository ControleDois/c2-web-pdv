import { apiGet } from './api'

// Aviso da cobrança da assinatura (boleto e PIX para pagar na hora), vindo da matriz.
export interface LicenseNotice {
  show: boolean
  // due_soon = vence nos próximos dias; due_today = vence hoje; overdue = já venceu
  state: 'due_soon' | 'due_today' | 'overdue' | null
  days_left: number | null
  due_date: string | null
  amount: number | null
  bill_name: string | null
  warning_days: number
  blocked: boolean
  boleto: {
    provider: string | null
    pdf_url: string | null
    digitable_line: string | null
    barcode: string | null
    pix_copy_paste: string | null
  } | null
}

export function fetchLicenseNotice(token: string, companyId: string) {
  return apiGet<LicenseNotice>('/license/notice', { companyId }, token)
}
