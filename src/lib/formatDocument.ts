import { formatCnpj } from './formatCnpj'
import { formatCpf } from './formatCpf'

export function formatDocument(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 11 ? formatCnpj(raw) : formatCpf(raw)
}
