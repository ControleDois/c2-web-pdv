import { apiGet, apiPost } from './api'

export interface CompanyWhatsapp {
  id: string
  name: string
  phone: string
  official_whatsapp?: boolean
}

// WhatsApps (instâncias UAZAPI) conectados da empresa - só esses enviam documento.
export function fetchCompanyWhatsapps(token: string, companyId: string) {
  return apiGet<{ data: CompanyWhatsapp[] }>('/whatsapp', { companyId, limit: '100' }, token).then((res) =>
    (res.data || []).filter((item) => !item.official_whatsapp)
  )
}

// Envia o PDF da NFC-e autorizada para o WhatsApp do cliente (vai pra fila de envio da instância escolhida).
export function sendNfceWhatsapp(
  token: string,
  nfeId: string,
  payload: { whatsappId: string; phone: string; name?: string }
) {
  return apiPost<{ message: string }>(`/nfe/${nfeId}/send-whatsapp`, payload, token)
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}
