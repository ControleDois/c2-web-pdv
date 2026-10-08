import { apiGet, apiPost } from './api'
import { formatDocument } from './formatDocument'
import type { NfceDetails } from './nfce'
import type { ReceiptData } from '../components/pdv/QuickSaleReceipt'

// Impressão direta: o PDV monta um documento (linhas de texto, valores, QR…)
// e manda para uma impressora cadastrada no sistema. O servidor de impressão
// do cliente (c2-delphi-print-server) busca o trabalho e converte em ESC/POS,
// respeitando as colunas, a codificação e o corte da impressora.

export interface PrintLine {
  t: 'text' | 'row' | 'hr' | 'qr' | 'barcode' | 'feed' | 'cut' | 'drawer'
  v?: string
  l?: string
  r?: string
  c?: string
  n?: number
  align?: 'left' | 'center' | 'right'
  bold?: boolean
  underline?: boolean
  size?: number
  height?: number
  type?: string
  partial?: boolean
}

export interface PrintDocument {
  lines: PrintLine[]
}

export interface PrinterOption {
  id: string
  name: string
  path: string
  active: boolean
}

export function fetchActivePrinters(token: string, companyId: string) {
  return apiGet<{ data: PrinterOption[] }>('/printer', { companyId, active: 'true', limit: '100' }, token).then(
    (res) => res.data || []
  )
}

export function createPrintJob(
  token: string,
  payload: { company_id: string; printer_id: string; title?: string; payload: PrintDocument; copies?: number }
) {
  return apiPost<{ id: string }>('/print-job', payload, token)
}

export interface PrintJobItem {
  id: string
  code?: number
  title?: string | null
  // 0 na fila, 1 imprimindo, 2 impresso, 3 erro, 4 cancelado
  status: number
  error?: string | null
  created_at?: string
  printed_at?: string | null
  printer?: { id: string; name: string } | null
}

export function fetchPrintJobs(token: string, companyId: string, limit = 30) {
  return apiGet<{ data: PrintJobItem[] }>('/print-job', { companyId, limit: String(limit) }, token).then(
    (res) => res.data || []
  )
}

// Reimprime uma impressão anterior (cria uma nova, igual à original; a
// impressora pode ser outra - papel acabou, impressora com defeito).
export function reprintJob(token: string, jobId: string, printerId?: string) {
  return apiPost<{ id: string }>(`/print-job/${jobId}/reprint`, { printer_id: printerId }, token)
}

const money = (value: number | null | undefined) =>
  (Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const currency = (value: number | null | undefined) => `R$ ${money(value)}`

const quantity = (value: number | null | undefined) => {
  const number = Number(value) || 0
  return Number.isInteger(number) ? String(number) : number.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function dateTime(iso: string, withSeconds = true) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: withSeconds ? 'numeric' : '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const chaveFormatada = (chave: string) =>
  (chave || '')
    .replace(/\D/g, '')
    .replace(/(\d{4})(?=\d)/g, '$1 ')
    .trim()

// Comprovante da venda rápida (mesmo conteúdo do QuickSaleReceipt, em bobina).
// secondCopy marca "2ª VIA" no topo (reimpressão pela tela de vendas).
export function buildQuickSaleDocument(data: ReceiptData, options: { secondCopy?: boolean } = {}): PrintDocument {
  const lines: PrintLine[] = []
  if (options.secondCopy) lines.push({ t: 'text', v: '*** 2ª VIA ***', align: 'center', bold: true })
  lines.push({ t: 'text', v: data.companyName, align: 'center', bold: true })
  if (data.companyDocument) lines.push({ t: 'text', v: data.companyDocument, align: 'center' })
  lines.push(
    { t: 'text', v: `Venda Rápida${data.code ? ` · #${data.code}` : ''}`, align: 'center' },
    { t: 'text', v: dateTime(data.date, false), align: 'center' }
  )
  if (data.clientName) lines.push({ t: 'text', v: `Cliente: ${data.clientName}`, align: 'center' })

  lines.push({ t: 'hr' })
  for (const item of data.items) {
    lines.push({ t: 'row', l: `${item.quantity}x ${item.name}`, r: money(item.total) })
  }
  lines.push({ t: 'hr' })
  lines.push({ t: 'row', l: 'TOTAL', r: currency(data.total), bold: true })

  for (const payment of data.payments) {
    lines.push({ t: 'row', l: payment.name, r: currency(payment.amount) })
  }
  if (data.change > 0) lines.push({ t: 'row', l: 'Troco', r: currency(data.change), bold: true })

  lines.push({ t: 'feed', n: 1 }, { t: 'text', v: 'Obrigado pela preferência!', align: 'center' }, { t: 'feed', n: 2 }, { t: 'cut' })
  return { lines }
}

const PROCON_BY_UF: Record<string, string> = {
  MT: 'TELEFONE DO PROCON: 65-3613-2100 | ENDERECO DO PROCON: R. PAES DE OLIVEIRA, S/N - CENTRO, CUIABA - MT, 78005-260',
}

// DANFE NFC-e em bobina (mesmo conteúdo do NfceReceipt).
export function buildNfceDocument(nfce: NfceDetails, qrCodeUrl: string | null): PrintDocument {
  const emitterDocument = nfce.cnpj_emitente || nfce.cpf_emitente || ''
  const consumerDocument = nfce.cnpj_destinatario || nfce.cpf_destinatario || ''
  const address1 = [nfce.logradouro_emitente, nfce.numero_emitente ? `nº ${nfce.numero_emitente}` : ''].filter(Boolean).join(', ')
  const address2 = [nfce.bairro_emitente, nfce.municipio_emitente, nfce.uf_emitente].filter(Boolean).join(', ')
  const address3 = [nfce.telefone_emitente].filter(Boolean).join(' ')

  const lines: PrintLine[] = [
    { t: 'text', v: nfce.nome_fantasia_emitente || nfce.nome_emitente, align: 'center', bold: true },
  ]
  if (emitterDocument || nfce.inscricao_estadual_emitente) {
    lines.push({
      t: 'text',
      v: `${emitterDocument ? `CNPJ: ${formatDocument(emitterDocument)}` : ''}${nfce.inscricao_estadual_emitente ? ` I.E.: ${nfce.inscricao_estadual_emitente}` : ''}`.trim(),
      align: 'center',
    })
  }
  for (const address of [address1, address2, address3]) {
    if (address) lines.push({ t: 'text', v: address, align: 'center' })
  }

  lines.push(
    { t: 'hr' },
    { t: 'text', v: 'DANFE NFC-e - DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA', align: 'center', bold: true },
    { t: 'hr' }
  )

  for (const item of nfce.itens) {
    lines.push({ t: 'text', v: `${item.numero_item} ${item.codigo_produto} ${item.descricao}` })
    lines.push({
      t: 'row',
      l: `  ${quantity(item.quantidade_comercial)} ${item.unidade_comercial} x ${money(item.valor_unitario_comercial)}`,
      r: money(item.valor_bruto),
    })
  }
  lines.push({ t: 'hr' })

  const totalItems = nfce.itens.reduce((sum, item) => sum + Number(item.quantidade_comercial || 0), 0)
  const extras = Number(nfce.valor_frete || 0) + Number(nfce.valor_seguro || 0) + Number(nfce.valor_outras_despesas || 0)
  lines.push({ t: 'row', l: 'Qtde. Total de Itens', r: quantity(totalItems) })
  lines.push({ t: 'row', l: 'Valor Total R$', r: money(nfce.valor_produtos) })
  if (Number(nfce.valor_desconto) > 0) lines.push({ t: 'row', l: 'Descontos R$', r: `-${money(nfce.valor_desconto)}` })
  if (extras > 0) lines.push({ t: 'row', l: 'Acréscimos R$', r: money(extras) })
  lines.push({ t: 'row', l: 'Valor a Pagar R$', r: money(nfce.valor_total), bold: true })

  if (nfce.pagamentos.length > 0) {
    lines.push({ t: 'hr' }, { t: 'row', l: 'FORMA DE PAGAMENTO', r: 'VALOR PAGO', bold: true })
    for (const payment of nfce.pagamentos) {
      lines.push({ t: 'row', l: payment.descricao_pagamento || payment.forma_pagamento, r: money(payment.valor_pagamento) })
    }
  }

  lines.push(
    { t: 'hr' },
    { t: 'text', v: 'Consulte pela Chave de Acesso em', align: 'center', bold: true },
    { t: 'text', v: chaveFormatada(nfce.chave_nfe), align: 'center' },
    {
      t: 'text',
      v: consumerDocument ? `CONSUMIDOR: ${nfce.nome_destinatario || ''} - ${formatDocument(consumerDocument)}` : 'CONSUMIDOR NÃO IDENTIFICADO.',
      align: 'center',
    },
    { t: 'hr' },
    { t: 'text', v: `NFC-e nº ${nfce.numero} Série ${nfce.serie} ${dateTime(nfce.data_emissao)}`, align: 'center', bold: true }
  )
  if (nfce.protocolo) lines.push({ t: 'text', v: `Protocolo de autorização: ${nfce.protocolo}`, align: 'center', bold: true })
  lines.push({ t: 'text', v: `Data de autorização: ${dateTime(nfce.updatedAt, false)}`, align: 'center', bold: true })

  if (qrCodeUrl) lines.push({ t: 'feed', n: 1 }, { t: 'qr', v: qrCodeUrl, size: 6, align: 'center' })

  if (Number(nfce.valor_total_tributos) > 0) {
    lines.push({ t: 'hr' }, { t: 'text', v: `Tributos totais incidentes (Lei Federal 12.741/2012) R$ ${money(nfce.valor_total_tributos)}`, align: 'center' })
  }
  const procon = nfce.uf_emitente ? PROCON_BY_UF[nfce.uf_emitente] : undefined
  if (procon) lines.push({ t: 'hr' }, { t: 'text', v: procon, align: 'center' })

  lines.push({ t: 'feed', n: 2 }, { t: 'cut' })
  return { lines }
}

// ---- Vendas rápidas recentes (tela de vendas: reimprimir comprovante, NFC-e e fichas)

export interface QuickSaleItem {
  id: string
  code: number
  created_at: string
  client_name: string | null
  total: number
  items: { name: string; quantity: number; unit_value: number; total: number }[]
  payments: { name: string; amount: number }[]
  // status: 1 processando, 2 autorizada, 3 erro
  nfce: { id: string; status: number; numero: number | null } | null
  tokens: { issued: number; redeemed: number; canceled: number }
}

export function fetchQuickSales(token: string, companyId: string, options: { search?: string; limit?: number } = {}) {
  return apiGet<QuickSaleItem[]>(
    '/pdv/quick-sales',
    { companyId, search: options.search, limit: String(options.limit ?? 40) },
    token
  )
}

// Reimprime as fichas que ainda valem (mesmos códigos).
export function reprintSaleTokens(token: string, companyId: string, saleId: string, printerId: string | null) {
  return apiPost<{ tokens: number; printed: boolean; jobs?: number; documents?: PrintDocument[] }>(
    '/sale-token/reprint',
    { company_id: companyId, sale_id: saleId, printer_id: printerId },
    token
  )
}
