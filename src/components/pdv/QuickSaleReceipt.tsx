import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency, formatDateTime } from '../../lib/format'

export interface ReceiptItem {
  name: string
  quantity: number
  unitValue: number
  total: number
}

export interface ReceiptPayment {
  name: string
  amount: number
}

export interface ReceiptData {
  companyName: string
  companyDocument?: string | null
  code?: number
  date: string
  clientName?: string | null
  items: ReceiptItem[]
  total: number
  payments: ReceiptPayment[]
  change: number
}

type PrintModel = 'thermal' | 'a4'

interface QuickSaleReceiptProps {
  data: ReceiptData
  printModel: PrintModel
}

function ReceiptBody({ data, printModel }: QuickSaleReceiptProps) {
  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <p style={{ fontWeight: 700, fontSize: printModel === 'thermal' ? '13px' : '16px', margin: 0 }}>
          {data.companyName}
        </p>
        {data.companyDocument && <p style={{ margin: 0 }}>{data.companyDocument}</p>}
        <p style={{ margin: '4px 0 0' }}>Venda Rápida{data.code ? ` · #${data.code}` : ''}</p>
        <p style={{ margin: 0 }}>{formatDateTime(data.date)}</p>
        {data.clientName && <p style={{ margin: '4px 0 0' }}>Cliente: {data.clientName}</p>}
      </div>

      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '6px 0', margin: '6px 0' }}>
        {data.items.map((item, index) => (
          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
            <span style={{ flex: 1 }}>
              {item.quantity}x {item.name}
            </span>
            <span>{formatCurrency(item.total)}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: printModel === 'thermal' ? '14px' : '16px' }}>
        <span>TOTAL</span>
        <span>{formatCurrency(data.total)}</span>
      </div>

      <div style={{ marginTop: 8 }}>
        {data.payments.map((payment, index) => (
          <div key={index} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{payment.name}</span>
            <span>{formatCurrency(payment.amount)}</span>
          </div>
        ))}
        {data.change > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>Troco</span>
            <span>{formatCurrency(data.change)}</span>
          </div>
        )}
      </div>

      <p style={{ textAlign: 'center', marginTop: 14, fontSize: '11px' }}>Obrigado pela preferência!</p>
    </>
  )
}

// Pré-visualização na tela (dentro do modal).
export function QuickSaleReceipt({ data, printModel }: QuickSaleReceiptProps) {
  return (
    <div
      className={printModel === 'thermal' ? 'thermal-receipt' : 'a4-receipt'}
      style={
        printModel === 'thermal'
          ? { width: '300px', fontFamily: 'monospace', fontSize: '12px', color: '#000', background: '#fff' }
          : { width: '100%', maxWidth: '700px', fontFamily: 'sans-serif', fontSize: '13px', color: '#000', background: '#fff' }
      }
    >
      <ReceiptBody data={data} printModel={printModel} />
    </div>
  )
}

const MM_PER_PX = 25.4 / 96

// Cópia do comprovante feita só pra impressão, montada direto no <body>
// (fora do app/modal). No @media print o #root inteiro some e só esta cópia
// aparece - ver index.css. O tamanho da página também é definido aqui:
//  - térmica: 80mm de largura e altura medida do conteúdo (sai do tamanho do
//    cupom, sem folha em branco); margem 0 também some com cabeçalho/rodapé
//    do navegador (data, título, URL).
//  - A4: retrato, margem tratada por padding do próprio comprovante.
export function QuickSalePrintPortal({ data, printModel }: QuickSaleReceiptProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [thermalHeightMm, setThermalHeightMm] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (printModel !== 'thermal' || !contentRef.current) {
      setThermalHeightMm(null)
      return
    }
    setThermalHeightMm(Math.ceil(contentRef.current.scrollHeight * MM_PER_PX) + 4)
  }, [data, printModel])

  const pageRule =
    printModel === 'thermal'
      ? `@page { size: 80mm ${thermalHeightMm ?? 200}mm; margin: 0; }`
      : '@page { size: A4 portrait; margin: 0; }'

  return createPortal(
    <div id="pdv-print-root">
      <style>{pageRule}</style>
      <div
        ref={contentRef}
        style={
          printModel === 'thermal'
            ? {
                width: '80mm',
                boxSizing: 'border-box',
                padding: '4mm',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#000',
                background: '#fff',
              }
            : {
                width: '210mm',
                boxSizing: 'border-box',
                padding: '18mm 22mm',
                fontFamily: 'sans-serif',
                fontSize: '13px',
                color: '#000',
                background: '#fff',
              }
        }
      >
        <ReceiptBody data={data} printModel={printModel} />
      </div>
    </div>,
    document.body
  )
}
