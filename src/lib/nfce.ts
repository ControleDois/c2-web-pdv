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

export interface NfceHistoryItem {
  id: string
  code?: number
  numero?: number | null
  serie?: number | null
  status: number
  mensagem_sefaz?: string | null
  saleId?: string | null
  data_emissao?: string | null
  createdAt?: string
  people?: { id: string; name: string } | null
}

interface Paginated<T> {
  data: T[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

// Histórico de NFC-e da empresa (modelo 65), mais recente primeiro - mesma
// listagem de Notas Fiscais do administrativo, só filtrada. status: 1 =
// processando, 2 = autorizada, 3 = erro/rejeitada.
export function fetchNfceHistory(
  token: string,
  companyId: string,
  options: { page?: number; limit?: number } = {}
) {
  return apiGet<Paginated<NfceHistoryItem>>(
    '/nfe',
    {
      companyId,
      modelo: '65',
      page: options.page ? String(options.page) : '1',
      limit: options.limit ? String(options.limit) : '30',
    },
    token
  )
}

export interface NfceItemDetail {
  numero_item: string
  codigo_produto: string
  descricao: string
  unidade_comercial: string
  quantidade_comercial: number
  valor_unitario_comercial: number
  valor_bruto: number
}

export interface NfcePaymentDetail {
  forma_pagamento: string
  descricao_pagamento: string
  valor_pagamento: number
}

// Tudo que o cupom (DANFE NFC-e) precisa pra se desenhar sozinho, sem
// depender do PDF gerado pelo Delphi/ACBr - ver QuickSaleReceipt.tsx. Vem
// direto do que a própria nota já guarda (emitente é denormalizado na
// nota na hora da emissão, não muda mesmo se o cadastro da empresa mudar
// depois).
export interface NfceDetails {
  id: string
  numero: number
  serie: number
  chave_nfe: string
  protocolo: string | null
  data_emissao: string
  updatedAt: string
  status: number
  nome_emitente: string
  nome_fantasia_emitente: string | null
  cnpj_emitente: string | null
  cpf_emitente: string | null
  inscricao_estadual_emitente: string | null
  logradouro_emitente: string | null
  numero_emitente: string | null
  bairro_emitente: string | null
  municipio_emitente: string | null
  uf_emitente: string | null
  cep_emitente: string | null
  telefone_emitente: string | null
  nome_destinatario: string | null
  cpf_destinatario: string | null
  cnpj_destinatario: string | null
  valor_produtos: number
  valor_desconto: number
  valor_frete: number
  valor_seguro: number
  valor_outras_despesas: number
  valor_total: number
  valor_total_tributos: number | null
  itens: NfceItemDetail[]
  pagamentos: NfcePaymentDetail[]
}

export function fetchNfceDetails(token: string, nfeId: string) {
  return apiGet<NfceDetails>(`/nfe/${nfeId}`, undefined, token)
}

export function fetchNfceQrCode(token: string, nfeId: string) {
  return apiGet<{ url: string }>(`/nfe/${nfeId}/qrcode`, undefined, token)
}
