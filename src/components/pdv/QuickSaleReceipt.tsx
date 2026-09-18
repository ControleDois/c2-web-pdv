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

interface QuickSaleReceiptProps {
  data: ReceiptData
  printModel: 'thermal' | 'a4'
}

// Área isolada de impressão - só o que está dentro de #pdv-print-area
// aparece no @media print (ver index.css), igual ao padrão do Angular.
export function QuickSaleReceipt({ data, printModel }: QuickSaleReceiptProps) {
  return (
    <div
      id="pdv-print-area"
      className={printModel === 'thermal' ? 'thermal-receipt' : 'a4-receipt'}
      style={
        printModel === 'thermal'
          ? { width: '300px', fontFamily: 'monospace', fontSize: '12px', color: '#000', background: '#fff' }
          : { width: '100%', maxWidth: '700px', fontFamily: 'sans-serif', fontSize: '13px', color: '#000', background: '#fff' }
      }
    >
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
    </div>
  )
}
