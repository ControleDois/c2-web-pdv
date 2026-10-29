import { fetchProducts } from './products'
import { replaceProducts, type LocalProduct } from './db'

const PAGE_SIZE = 100

// Uma atualização por vez: a automática não começa enquanto outra (manual ou automática) roda.
let syncing = false

export function isCatalogSyncing() {
  return syncing
}

export interface CatalogProgress {
  page: number
  totalPages: number
  downloaded: number
  total: number
}

// Baixa o catálogo inteiro (página por página) e só então troca a base local, pra busca de produto
// funcionar offline durante o atendimento. Usado na primeira abertura, no botão de Ajustes e na
// atualização automática em segundo plano.
export async function downloadCatalog(
  token: string,
  companyId: string,
  onProgress?: (progress: CatalogProgress) => void
): Promise<number> {
  syncing = true
  try {
    return await downloadAllPages(token, companyId, onProgress)
  } finally {
    syncing = false
  }
}

async function downloadAllPages(
  token: string,
  companyId: string,
  onProgress?: (progress: CatalogProgress) => void
): Promise<number> {
  const products: LocalProduct[] = []
  let currentPage = 1
  let lastPage = 1

  do {
    const res = await fetchProducts(token, companyId, { page: currentPage, limit: PAGE_SIZE })
    const items = res.data || []
    lastPage = res.meta?.last_page ?? 1
    products.push(
      ...items.map((product) => ({
        id: product.id,
        code: product.internal_code ?? product.code,
        barcode: product.barcode,
        name: product.name,
        sale_value: product.sale_value,
        unit: product.unit,
        ask_name: product.ask_name,
        role: product.role,
      }))
    )
    onProgress?.({
      page: currentPage,
      totalPages: lastPage,
      downloaded: products.length,
      total: res.meta?.total ?? products.length,
    })
    currentPage += 1
  } while (currentPage <= lastPage)

  await replaceProducts(products)
  return products.length
}
