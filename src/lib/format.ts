const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const percentFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value || 0)
}

export function formatPercent(value: number): string {
  return `${percentFormatter.format(value || 0)}%`
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

const quantityFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

export function formatQuantity(value: number): string {
  return quantityFormatter.format(value || 0)
}
