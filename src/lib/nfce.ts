import { apiGet, apiPost, apiFetchBlob, ApiError } from './api'

export type NfceMode = 'off' | 'ask' | 'always'

export interface NfceResult {
  mensagem?: string
  job_id?: string
  nfe?: { id: string; [key: string]: unknown }
}

// Mesmo fluxo da NF-e no administrativo: gera a nota (modelo 65) a partir da
// venda e coloca na fila de envio - o retorno é "enviada pra processamento",
// a autorização em si aparece depois em Notas Fiscais.
export function generateNfceFromSale(token: string, saleId: string) {
  return apiPost<NfceResult>(`/nfe/generate-nfce-from-sale/${saleId}`, {}, token)
}

// O backend devolve { message, errors: [{ message }] } quando o cadastro tem
// pendência (ex: produto sem NCM) - junta as primeiras pra mostrar na tela.
export function nfceErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const errors = (err.body as { errors?: { message?: string }[] } | undefined)?.errors
    const details = Array.isArray(errors)
      ? errors
          .map((item) => item?.message)
          .filter(Boolean)
          .slice(0, 3)
          .join('; ')
      : ''
    return details ? `${err.message} ${details}` : err.message
  }
  return 'Não foi possível enviar a NFC-e.'
}

interface NfeStatusResponse {
  status?: number
  mensagem_sefaz?: string | null
  numero?: number
}

export interface NfceOutcome {
  authorized: boolean
  pending: boolean
  message: string
  number?: number
}

const POLL_INTERVAL_MS = 2500
const POLL_TIMEOUT_MS = 90_000

// Status da NF-e: 1 = em processamento, 2 = autorizada, 3 = erro/rejeitada.
// Aguarda o retorno do envio (fila + SEFAZ) e devolve o resultado final.
export async function waitNfceOutcome(token: string, nfeId: string): Promise<NfceOutcome> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    let nfe: NfeStatusResponse
    try {
      nfe = await apiGet<NfeStatusResponse>(`/nfe/${nfeId}`, undefined, token)
    } catch {
      continue
    }
    if (Number(nfe.status) === 2) {
      return { authorized: true, pending: false, message: 'NFC-e autorizada.', number: nfe.numero }
    }
    if (Number(nfe.status) === 3) {
      return {
        authorized: false,
        pending: false,
        message: String(nfe.mensagem_sefaz || 'A NFC-e foi rejeitada.').trim(),
      }
    }
  }
  return {
    authorized: false,
    pending: true,
    message: 'A SEFAZ ainda está processando a NFC-e. Consulte em Notas Fiscais em instantes.',
  }
}

export function fetchNfceDanfe(token: string, nfeId: string): Promise<Blob> {
  return apiFetchBlob(`/nfe/${nfeId}/file/danfe`, undefined, token)
}
