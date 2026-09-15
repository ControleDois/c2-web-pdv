export function formatCpf(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 11)]

  let result = parts[0]
  if (parts[1]) result += '.' + parts[1]
  if (parts[2]) result += '.' + parts[2]
  if (parts[3]) result += '-' + parts[3]
  return result
}
