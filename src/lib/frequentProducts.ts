import type { LocalProduct } from './db'

interface Entry {
  product: LocalProduct
  count: number
  last: number
}

const MAX_ENTRIES = 40

function key(companyId: string) {
  return `pdv.frequent.${companyId}`
}

function read(companyId: string): Entry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(companyId)) ?? '[]')
    return Array.isArray(parsed) ? (parsed as Entry[]) : []
  } catch {
    return []
  }
}

// Produtos mais usados neste aparelho (para os botões de venda com um toque no celular).
export function loadFrequentProducts(companyId: string, limit = 12): LocalProduct[] {
  return read(companyId)
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, limit)
    .map((entry) => entry.product)
}

export function recordFrequentProduct(companyId: string, product: LocalProduct) {
  try {
    const entries = read(companyId)
    const found = entries.find((entry) => entry.product.id === product.id)
    const snapshot: LocalProduct = {
      id: product.id,
      code: product.code,
      barcode: product.barcode,
      name: product.name,
      sale_value: product.sale_value,
      unit: product.unit,
      ask_name: product.ask_name,
      role: product.role,
    }
    if (found) {
      found.count += 1
      found.last = Date.now()
      found.product = snapshot
    } else {
      entries.push({ product: snapshot, count: 1, last: Date.now() })
    }
    entries.sort((a, b) => b.count - a.count || b.last - a.last)
    localStorage.setItem(key(companyId), JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    // sem armazenamento local: só perde o atalho
  }
}
