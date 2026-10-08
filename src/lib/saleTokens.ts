import { apiPost } from './api'

// Fichas de venda (distribuidora): cada unidade de produto marcado imprime uma
// ficha com código de barras; o caixa bipa a ficha na troca e o sistema dá baixa.

export interface IssueTokensResult {
  tokens: number
  created: boolean
  printed: boolean
  jobs?: number
  // already_issued | no_token_products | no_printer
  reason?: string
}

export function issueSaleTokens(token: string, companyId: string, saleId: string) {
  return apiPost<IssueTokensResult>('/sale-token/issue', { company_id: companyId, sale_id: saleId }, token)
}

export interface RedeemResult {
  ok: boolean
  // not_found | already_redeemed | canceled
  reason?: string
  message?: string
  token?: {
    id: string
    product_name: string
    sale_code?: number | null
    sequence: number
    total: number
    redeemed_at?: string | null
  }
}

export function redeemSaleToken(token: string, companyId: string, code: string) {
  return apiPost<RedeemResult>('/sale-token/redeem', { company_id: companyId, code }, token)
}
