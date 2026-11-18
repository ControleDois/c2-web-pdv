import { apiGet } from './api'

// Cardápio das mesas (mesmo do app do garçom): categorias, produtos com preço e adicionais.
// Fica guardado no aparelho para a mesa abrir na hora e funcionar sem internet.

export interface MenuComplementOption {
  id: string
  description: string
  sale_value: number
}

export interface MenuComplement {
  id: string
  name: string
  required: boolean
  minimum: number
  maximum: number
  options: MenuComplementOption[]
}

export interface MenuProduct {
  id: string
  code: number | string
  internal_code?: number | null
  name: string
  description: string | null
  sale_value: number
  unit: string | null
  image_url: string | null
  category_ids: string[]
  complements: MenuComplement[]
}

export interface MenuCategory {
  id: string
  name: string
  position?: number | null
}

export interface FoodMenu {
  idle_alert_minutes?: number
  categories: MenuCategory[]
  products: MenuProduct[]
}

const cacheKey = (companyId: string) => `c2_pdv_food_menu_${companyId}`

export function loadCachedMenu(companyId: string): FoodMenu | null {
  try {
    const raw = localStorage.getItem(cacheKey(companyId))
    return raw ? (JSON.parse(raw) as FoodMenu) : null
  } catch {
    return null
  }
}

export async function fetchFoodMenu(token: string, companyId: string): Promise<FoodMenu> {
  const menu = await apiGet<FoodMenu>('/food/menu', { companyId }, token)
  const normalized: FoodMenu = {
    idle_alert_minutes: menu.idle_alert_minutes,
    categories: menu.categories || [],
    products: (menu.products || []).map((product) => ({ ...product, complements: product.complements || [] })),
  }
  try {
    localStorage.setItem(cacheKey(companyId), JSON.stringify(normalized))
  } catch {
    // sem espaço: só não guarda a cópia
  }
  return normalized
}

export interface ChosenOption {
  complementId: string
  option: MenuComplementOption
  quantity: number
}

// Mesmo texto do cardápio online: "Grupo: opção, opção x2 | Obs: ...".
export function describeChoices(product: MenuProduct, chosen: ChosenOption[], note: string) {
  const parts: string[] = []
  for (const group of product.complements) {
    const picked = chosen.filter((choice) => choice.complementId === group.id && choice.quantity > 0)
    if (picked.length === 0) continue
    parts.push(
      `${group.name}: ${picked
        .map((choice) => (choice.quantity > 1 ? `${choice.option.description} x${choice.quantity}` : choice.option.description))
        .join(', ')}`
    )
  }
  if (note.trim()) parts.push(`Obs: ${note.trim().slice(0, 150)}`)
  return parts.join(' | ').slice(0, 255)
}

// Mínimo/máximo de cada grupo; o máximo só limita as opções grátis (igual ao cardápio online).
export function validateChoices(product: MenuProduct, chosen: ChosenOption[]): string | null {
  for (const group of product.complements) {
    const picked = chosen.filter((choice) => choice.complementId === group.id)
    const total = picked.reduce((sum, choice) => sum + choice.quantity, 0)
    const free = picked.filter((choice) => !choice.option.sale_value).reduce((sum, choice) => sum + choice.quantity, 0)
    const minimum = group.required ? Math.max(group.minimum, 1) : group.minimum
    if (total < minimum) return `Escolha ${minimum === 1 ? 'uma opção' : `ao menos ${minimum} opções`} em "${group.name}".`
    if (group.maximum > 0 && free > group.maximum) return `No máximo ${group.maximum} opção(ões) grátis em "${group.name}".`
  }
  return null
}
