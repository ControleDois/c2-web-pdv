import { apiPost, ApiError } from './api'

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
