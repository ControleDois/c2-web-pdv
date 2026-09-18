import { apiGet, apiPost, ApiError } from './api'

export interface AuthPeople {
  id: string
  name: string
  document?: string | null
  file_url?: string | null
  role?: { id: string; name: string } | null
  [key: string]: unknown
}

export interface AuthToken {
  type: string
  token: string
}

// Subconjunto da Config da empresa usado pelo PDV - já vem preenchido no
// login/troca de empresa (o backend faz preload de `config` por empresa),
// não precisa de uma chamada extra pra buscar.
export interface ConfigRecord {
  id: string
  quick_sale_enabled?: boolean
  quick_sale_only_mode?: boolean
  quick_sale_ask_print_preview?: boolean
  quick_sale_print_model?: 'thermal' | 'a4'
  quick_sale_ask_quantity?: boolean
  quick_sale_ask_price?: boolean
  sale_category_default_id?: string | null
  sale_bank_account_default_id?: string | null
  sale_people_default_id?: string | null
  central_box_active?: number
  central_box_payment_methods?: string | null
  [key: string]: unknown
}

export interface AuthCompany {
  id: string
  system_type?: number
  license_status?: string
  license_expires_at?: string | null
  people?: AuthPeople | null
  config?: ConfigRecord | null
  isMaster?: boolean
  // Flag de empresa matriz ("Controle Dois", Company.is_master) — diferente de
  // `isMaster`, que é a role de usuário (ROLE_MASTER_ID) dentro de uma empresa.
  // É essa flag que deve gatear telas restritas à matriz, como Licenças.
  is_master?: boolean
  [key: string]: unknown
}

export interface AuthUser {
  id: string
  email: string
  people?: AuthPeople | null
  companies?: AuthCompany[]
  [key: string]: unknown
}

export interface AuthSession {
  token: AuthToken
  user: AuthUser
  company: AuthCompany
  isMaster?: boolean
}

const SESSION_KEY = 'c2_auth'
const ACTIVE_COMPANY_KEY = 'c2_active_company'

export async function signin(email: string, password: string) {
  try {
    return await apiPost<AuthSession>('/auth/signin', { email, password })
  } catch (err) {
    if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
      throw new ApiError('E-mail ou senha inválidos.', err.status)
    }
    throw err
  }
}

// Recarrega as empresas vinculadas ao usuário logado, sem precisar de um
// novo login — usado ao clicar em "Trocar empresa", pra refletir empresas
// criadas/removidas/alteradas depois do login original.
export function fetchMyCompanies(token: string) {
  return apiGet<{ user: AuthUser; companies: AuthCompany[] }>('/auth/me', {}, token)
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthSession
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  clearActiveCompany()
}

export function saveActiveCompany(company: AuthCompany) {
  localStorage.setItem(ACTIVE_COMPANY_KEY, JSON.stringify(company))
}

export function loadActiveCompany(): AuthCompany | null {
  const raw = localStorage.getItem(ACTIVE_COMPANY_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthCompany
  } catch {
    return null
  }
}

export function clearActiveCompany() {
  localStorage.removeItem(ACTIVE_COMPANY_KEY)
}

export function getUserCompanies(session: AuthSession): AuthCompany[] {
  if (session.user.companies && session.user.companies.length > 0) {
    return session.user.companies
  }
  return session.company ? [session.company] : []
}

export function getPersonName(user: AuthUser): string {
  return user.people?.name ?? user.email
}

export function getUserRoleName(user: AuthUser): string | null {
  return user.people?.role?.name ?? null
}

export function getCompanyName(company: AuthCompany): string {
  return company.people?.name ?? 'Empresa sem nome'
}

// A role Master é por (usuário, empresa) — por isso a flag vive em cada
// AuthCompany (não só no topo da sessão), pra continuar correta quando o
// usuário troca de empresa sem precisar logar de novo.
//
// `companyId` aqui é o id do People que representa a empresa (role=1) — o
// mesmo id usado nas rotas /company/:id — não o id da Company em si. É
// contra `company.people.id` que precisamos comparar, não `company.id`.
export function isMasterOfCompany(session: AuthSession, companyId: string | undefined): boolean {
  if (!companyId) return false
  const company = getUserCompanies(session).find((c) => c.people?.id === companyId)
  return Boolean(company?.isMaster)
}
