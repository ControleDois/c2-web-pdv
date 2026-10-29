import { apiPut } from './api'
import type { ConfigRecord } from './auth'

export interface QuickSaleConfigPayload {
  quick_sale_enabled?: boolean
  quick_sale_only_mode?: boolean
  quick_sale_ask_print_preview?: boolean
  // Impressoras do cadastro (tabela printers); null = mostra o preview
  quick_sale_receipt_printer_id?: string | null
  quick_sale_nfce_printer_id?: string | null
  quick_sale_print_model?: 'thermal' | 'a4'
  quick_sale_ask_quantity?: boolean
  quick_sale_ask_price?: boolean
  quick_sale_nfce_mode?: 'off' | 'ask' | 'always'
  quick_sale_nfse_mode?: 'off' | 'ask' | 'always'
  scale_enabled?: boolean
  scale_prefix?: string
  scale_code_digits?: number
  scale_value_digits?: number
  scale_value_type?: 'price' | 'weight'
  sale_tokens_enabled?: boolean
}

export function updateConfig(token: string, companyId: string, configId: string, payload: QuickSaleConfigPayload) {
  return apiPut<ConfigRecord>(`/config/${configId}`, { companyId, ...payload }, token)
}

// Fichas ligadas por padrão: empresa sem o ajuste salvo (antes da opção existir) continua como estava.
export function saleTokensEnabled(config?: ConfigRecord | null) {
  return config?.sale_tokens_enabled !== false
}
