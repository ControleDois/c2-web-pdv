export function isValidCpf(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false
  for (const size of [9, 10]) {
    let sum = 0
    for (let i = 0; i < size; i++) sum += Number(digits[i]) * (size + 1 - i)
    const check = ((sum * 10) % 11) % 10
    if (check !== Number(digits[size])) return false
  }
  return true
}

export function isValidCnpj(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false
  for (const size of [12, 13]) {
    const weights = size === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < size; i++) sum += Number(digits[i]) * weights[i]
    const rest = sum % 11
    const check = rest < 2 ? 0 : 11 - rest
    if (check !== Number(digits[size])) return false
  }
  return true
}

export function isValidConsumerDocument(raw: string): boolean {
  return isValidCpf(raw) || isValidCnpj(raw)
}
