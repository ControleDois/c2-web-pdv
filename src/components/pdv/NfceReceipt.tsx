import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { formatDocument } from '../../lib/formatDocument'
import type { NfceDetails } from '../../lib/nfce'

interface NfceReceiptProps {
  nfce: NfceDetails
  qrCodeUrl: string | null
}

function formatMoney(value: number | null | undefined): string {
  return (Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatQty(value: number | null | undefined): string {
  const num = Number(value) || 0
  return Number.isInteger(num) ? String(num) : num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

// Chave de acesso em grupos de 4 dígitos, igual todo DANFE NFC-e mostra.
function formatChave(chave: string): string {
  return (chave || '')
    .replace(/\D/g, '')
    .replace(/(\d{4})(?=\d)/g, '$1 ')
    .trim()
}

function formatDateTimeFull(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDateTimeShort(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function emitterDocument(nfce: NfceDetails): string {
  if (nfce.cnpj_emitente) return formatDocument(nfce.cnpj_emitente)
  if (nfce.cpf_emitente) return formatDocument(nfce.cpf_emitente)
  return ''
}

function consumerDocument(nfce: NfceDetails): string {
  if (nfce.cnpj_destinatario) return formatDocument(nfce.cnpj_destinatario)
  if (nfce.cpf_destinatario) return formatDocument(nfce.cpf_destinatario)
  return ''
}

// PROCON é texto informativo, não campo obrigatório do schema da NFC-e -
// mostra só quando sabemos o contato certo do estado (por enquanto só MT,
// onde a maioria dos clientes atuais está). Errar isso é pior que omitir.
const PROCON_BY_UF: Record<string, string> = {
  MT: 'TELEFONE DO PROCON: 65-3613-2100 | ENDERECO DO PROCON: R. PAES DE OLIVEIRA, S/N - CENTRO, CUIABA - MT, 78005-260',
}

function ReceiptBody({ nfce, qrCodeUrl }: NfceReceiptProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!qrCodeUrl) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(qrCodeUrl, { margin: 1, width: 260 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [qrCodeUrl])

  const enderecoLinha1 = [nfce.logradouro_emitente, nfce.numero_emitente ? `nº ${nfce.numero_emitente}` : '']
    .filter(Boolean)
    .join(', ')
  const enderecoLinha2 = [nfce.bairro_emitente, nfce.municipio_emitente, nfce.uf_emitente].filter(Boolean).join(', ')
  const enderecoLinha3 = [nfce.cep_emitente ? `CEP: ${nfce.cep_emitente}` : '', nfce.telefone_emitente]
    .filter(Boolean)
    .join(' ')

  const totalItens = nfce.itens.reduce((sum, item) => sum + Number(item.quantidade_comercial || 0), 0)
  const acrescimos = Number(nfce.valor_frete || 0) + Number(nfce.valor_seguro || 0) + Number(nfce.valor_outras_despesas || 0)
  const consumidorDoc = consumerDocument(nfce)
  const proconText = nfce.uf_emitente ? PROCON_BY_UF[nfce.uf_emitente] : undefined

  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontWeight: 700, fontSize: '13px', margin: 0 }}>{nfce.nome_fantasia_emitente || nfce.nome_emitente}</p>
        {(emitterDocument(nfce) || nfce.inscricao_estadual_emitente) && (
          <p style={{ margin: 0 }}>
            {emitterDocument(nfce) && `CNPJ:${emitterDocument(nfce)}`}
            {nfce.inscricao_estadual_emitente ? ` I.E.:${nfce.inscricao_estadual_emitente}` : ''}
          </p>
        )}
        {enderecoLinha1 && <p style={{ margin: 0 }}>{enderecoLinha1}</p>}
        {enderecoLinha2 && <p style={{ margin: 0 }}>{enderecoLinha2}</p>}
        {enderecoLinha3 && <p style={{ margin: 0 }}>{enderecoLinha3}</p>}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '6px 0 4px', paddingTop: '4px', textAlign: 'center' }}>
        <p style={{ fontWeight: 700, margin: 0, fontSize: '11.5px' }}>DANFE NFC-e - DOCUMENTO AUXILIAR DA NOTA FISCAL</p>
        <p style={{ fontWeight: 700, margin: 0, fontSize: '11.5px' }}>DE CONSUMIDOR ELETRÔNICA</p>
      </div>

      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '4px 0' }}>
        <div style={{ display: 'flex', fontWeight: 700, fontSize: '10.5px' }}>
          <span style={{ width: '10%' }}>#</span>
          <span style={{ width: '20%' }}>CÓD.</span>
          <span style={{ flex: 1 }}>DESCRIÇÃO</span>
        </div>
        {nfce.itens.map((item) => (
          <div key={item.numero_item} style={{ marginTop: '4px' }}>
            <div style={{ display: 'flex' }}>
              <span style={{ width: '10%' }}>{item.numero_item}</span>
              <span style={{ width: '20%' }}>{item.codigo_produto}</span>
              <span style={{ flex: 1 }}>{item.descricao}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', fontSize: '11px' }}>
              <span>
                {formatQty(item.quantidade_comercial)} {item.unidade_comercial}
              </span>
              <span>{formatMoney(item.valor_unitario_comercial)}</span>
              <span style={{ fontWeight: 700 }}>{formatMoney(item.valor_bruto)}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Qtde. Total de Itens</span>
        <span>{formatQty(totalItens)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Valor Total R$</span>
        <span>{formatMoney(nfce.valor_produtos)}</span>
      </div>
      {Number(nfce.valor_desconto) > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Descontos R$</span>
          <span>-{formatMoney(nfce.valor_desconto)}</span>
        </div>
      )}
      {acrescimos > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Acréscimos R$</span>
          <span>{formatMoney(acrescimos)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '13px' }}>
        <span>Valor a Pagar R$</span>
        <span>{formatMoney(nfce.valor_total)}</span>
      </div>

      {nfce.pagamentos.length > 0 && (
        <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '10.5px' }}>
            <span>FORMA DE PAGAMENTO</span>
            <span>VALOR PAGO</span>
          </div>
          {nfce.pagamentos.map((pagamento, index) => (
            <div key={index} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{pagamento.descricao_pagamento || pagamento.forma_pagamento}</span>
              <span>{formatMoney(pagamento.valor_pagamento)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '4px', textAlign: 'center' }}>
        <p style={{ fontWeight: 700, margin: 0 }}>Consulte pela Chave de Acesso em</p>
        <p style={{ margin: '2px 0', fontSize: '11px' }}>{formatChave(nfce.chave_nfe)}</p>
      </div>

      <p style={{ textAlign: 'center', margin: '4px 0' }}>
        {consumidorDoc
          ? `CONSUMIDOR: ${nfce.nome_destinatario || ''} - ${consumidorDoc}`
          : 'CONSUMIDOR NÃO IDENTIFICADO.'}
      </p>

      <div style={{ borderTop: '1px dashed #000', textAlign: 'center', paddingTop: '4px' }}>
        <p style={{ fontWeight: 700, margin: 0 }}>
          NFC-e nº {nfce.numero} Série {nfce.serie} {formatDateTimeFull(nfce.data_emissao)}
        </p>
        {nfce.protocolo && <p style={{ fontWeight: 700, margin: '2px 0 0' }}>Protocolo de autorização: {nfce.protocolo}</p>}
        <p style={{ fontWeight: 700, margin: '2px 0 0' }}>Data de autorização: {formatDateTimeShort(nfce.updatedAt)}</p>
      </div>

      {qrDataUrl && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
          <img
            src={qrDataUrl}
            alt="QR-code da NFC-e"
            style={{ display: 'block', width: '160px', height: '160px', margin: '0 auto' }}
          />
        </div>
      )}

      {Number(nfce.valor_total_tributos) > 0 && (
        <p style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '4px', margin: 0, fontSize: '10px' }}>
          Tributos totais incidentes (Lei Federal 12.741/2012) {formatMoney(nfce.valor_total_tributos)}
        </p>
      )}

      {proconText && (
        <p style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '4px', marginTop: '4px', fontSize: '9.5px' }}>
          {proconText}
        </p>
      )}
    </>
  )
}

// Pré-visualização na tela (dentro do modal).
export function NfceReceipt({ nfce, qrCodeUrl }: NfceReceiptProps) {
  return (
    <div
      className="thermal-receipt"
      style={{ width: '300px', fontFamily: 'monospace', fontSize: '12px', color: '#000', background: '#fff' }}
    >
      <ReceiptBody nfce={nfce} qrCodeUrl={qrCodeUrl} />
    </div>
  )
}

const MM_PER_PX = 25.4 / 96

// Mesma técnica do comprovante da venda rápida (ver QuickSaleReceipt.tsx):
// cópia montada direto no <body>, fora do app, que é a única coisa visível
// no @media print (index.css) - altura da bobina medida do próprio
// conteúdo, sem folha em branco sobrando.
export function NfcePrintPortal({ nfce, qrCodeUrl }: NfceReceiptProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [heightMm, setHeightMm] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!contentRef.current) return
    setHeightMm(Math.ceil(contentRef.current.scrollHeight * MM_PER_PX) + 4)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfce, qrCodeUrl, contentRef.current?.scrollHeight])

  return createPortal(
    <div id="pdv-print-root">
      <style>{`@page { size: 80mm ${heightMm ?? 200}mm; margin: 0; }`}</style>
      <div
        ref={contentRef}
        style={{
          width: '80mm',
          boxSizing: 'border-box',
          padding: '4mm',
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#000',
          background: '#fff',
        }}
      >
        <ReceiptBody nfce={nfce} qrCodeUrl={qrCodeUrl} />
      </div>
    </div>,
    document.body
  )
}
