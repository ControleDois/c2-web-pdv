import { apiPut } from './api'
import type { ConfigRecord } from './auth'

export interface QuickSaleConfigPayload {
  quick_sale_enabled?: boolean
  quick_sale_only_mode?: boolean
  quick_sale_ask_print_preview?: boolean
  quick_sale_print_model?: 'thermal' | 'a4'
  quick_sale_ask_quantity?: boolean
  quick_sale_ask_price?: boolean
  quick_sale_nfce_mode?: 'off' | 'ask' | 'always'
}

export function updateConfig(token: string, companyId: string, configId: string, payload: QuickSaleConfigPayload) {
  return apiPut<ConfigRecord>(`/config/${configId}`, { companyId, ...payload }, token)
}
