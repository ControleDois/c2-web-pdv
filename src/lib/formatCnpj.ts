export function formatCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 14)
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8), digits.slice(8, 12), digits.slice(12, 14)]

  let result = parts[0]
  if (parts[1]) result += '.' + parts[1]
  if (parts[2]) result += '.' + parts[2]
  if (parts[3]) result += '/' + parts[3]
  if (parts[4]) result += '-' + parts[4]
  return result
}
