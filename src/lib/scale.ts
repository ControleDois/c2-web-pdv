import { round2 } from './format'

export interface ScaleConfig {
  enabled: boolean
  prefix: string
  codeDigits: number
  valueDigits: number
  valueType: 'price' | 'weight'
}

export interface ScaleLabel {
  code: number
  value: number
}

export interface ScaleLine {
  quantity: number
  unitValue: number
  total: number
}

export function scaleConfigFrom(config: Record<string, unknown> | null | undefined): ScaleConfig {
  return {
    enabled: Boolean(config?.scale_enabled),
    prefix: String(config?.scale_prefix ?? '2'),
    codeDigits: Number(config?.scale_code_digits ?? 6),
    valueDigits: Number(config?.scale_value_digits ?? 5),
    valueType: config?.scale_value_type === 'weight' ? 'weight' : 'price',
  }
}

// O formato só fecha em 13 posições: prefixo + código do item + valor + dígito verificador.
export function scaleFormatLength(config: ScaleConfig): number {
  return config.prefix.length + config.codeDigits + config.valueDigits + 1
}

// Etiqueta de balança etiquetadora (ex.: Toledo Prix 4 Plus): EAN-13 com prefixo, código do item e o valor
// (preço total em centavos ou peso em gramas). Devolve null quando o código lido não é uma etiqueta de balança.
export function parseScaleLabel(raw: string, config: ScaleConfig): ScaleLabel | null {
  if (!config.enabled) return null
  const digits = raw.trim()
  if (!/^\d{13}$/.test(digits)) return null
  if (scaleFormatLength(config) !== 13 || !digits.startsWith(config.prefix)) return null

  const codeStart = config.prefix.length
  const valueStart = codeStart + config.codeDigits
  const code = Number(digits.slice(codeStart, valueStart))
  const rawValue = Number(digits.slice(valueStart, valueStart + config.valueDigits))
  if (!code) return null

  return { code, value: config.valueType === 'weight' ? rawValue / 1000 : rawValue / 100 }
}

// Transforma a etiqueta em linha de venda. Etiqueta de preço: acha o peso (3 casas, como a balança) cujo
// total no preço cadastrado dá exatamente o valor impresso. Etiqueta de peso: total = peso x preço do kg.
export function resolveScaleLine(label: ScaleLabel, config: ScaleConfig, pricePerUnit: number): ScaleLine | null {
  if (config.valueType === 'weight') {
    if (pricePerUnit <= 0 || label.value <= 0) return null
    return { quantity: label.value, unitValue: pricePerUnit, total: round2(label.value * pricePerUnit) }
  }

  if (label.value <= 0) return null
  if (pricePerUnit <= 0) return { quantity: 1, unitValue: label.value, total: label.value }

  const target = Math.round(label.value * 100)
  const estimate = Math.round((label.value / pricePerUnit) * 1000)
  let best = estimate
  let bestDiff = Number.POSITIVE_INFINITY
  for (let grams = Math.max(1, estimate - 12); grams <= estimate + 12; grams++) {
    const diff = Math.abs(Math.round((grams / 1000) * pricePerUnit * 100) - target)
    if (diff < bestDiff || (diff === bestDiff && Math.abs(grams - estimate) < Math.abs(best - estimate))) {
      best = grams
      bestDiff = diff
    }
  }
  return { quantity: best / 1000, unitValue: pricePerUnit, total: label.value }
}
