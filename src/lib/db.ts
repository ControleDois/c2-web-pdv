import { openDB, type IDBPDatabase } from 'idb'
import type { FoodTable } from './foodTypes'

export interface LocalProduct {
  id: string
  code?: number | string
  barcode?: string | null
  name: string
  sale_value?: number | null
  unit?: string | null
  [key: string]: unknown
}

const DB_NAME = 'controledois_web_pdv'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'id' })
          productStore.createIndex('name', 'name', { unique: false })
        }
        if (!db.objectStoreNames.contains('food_tables')) {
          const tableStore = db.createObjectStore('food_tables', { keyPath: 'id' })
          tableStore.createIndex('number', 'number', { unique: false })
          tableStore.createIndex('status', 'status', { unique: false })
          tableStore.createIndex('synchronized', 'synchronized', { unique: false })
          tableStore.createIndex('updatedAt', 'updatedAt', { unique: false })
        }
      },
    })
  }
  return dbPromise
}

export async function clearProducts(): Promise<void> {
  const db = await getDb()
  await db.transaction('products', 'readwrite').objectStore('products').clear()
}

export async function batchInsertProducts(products: LocalProduct[], batchSize = 100): Promise<void> {
  const db = await getDb()
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize)
    const tx = db.transaction('products', 'readwrite')
    const store = tx.objectStore('products')
    await Promise.all(batch.map((product) => store.put(product).catch(() => undefined)))
    await tx.done
  }
}

export async function countProducts(): Promise<number> {
  const db = await getDb()
  return db.transaction('products').objectStore('products').count()
}

// Mesmo algoritmo do Angular (IndexedDbService.filterProductBy): código
// exato primeiro, depois barcode exato, senão nome por substring (pode
// retornar vários — quem chama decide o que fazer com isso).
export async function filterProductBy(searchText: string): Promise<LocalProduct[]> {
  const db = await getDb()
  const all = (await db.transaction('products').objectStore('products').getAll()) as LocalProduct[]

  const byCode = all.find((p) => String(p.code ?? '') === searchText)
  if (byCode) return [byCode]

  const byBarcode = all.find((p) => (p.barcode ?? '').toLowerCase() === searchText.toLowerCase())
  if (byBarcode) return [byBarcode]

  return all.filter((p) => (p.name ?? '').toLowerCase().includes(searchText.toLowerCase()))
}

export async function getAllTables(): Promise<FoodTable[]> {
  const db = await getDb()
  return db.transaction('food_tables').objectStore('food_tables').getAll()
}

export async function putTable(table: FoodTable): Promise<void> {
  const db = await getDb()
  await db.transaction('food_tables', 'readwrite').objectStore('food_tables').put(table)
}

export async function deleteTable(id: string): Promise<void> {
  const db = await getDb()
  await db.transaction('food_tables', 'readwrite').objectStore('food_tables').delete(id)
}
