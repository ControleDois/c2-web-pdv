import { apiGet } from './api'

export interface PersonRecord {
  id: string
  name: string
  document?: string | null
  [key: string]: unknown
}

interface Paginated<T> {
  data: T[]
}

export function fetchMyPerson(token: string, companyId: string) {
  return apiGet<PersonRecord>('/people/me', { companyId }, token)
}

// Busca de cliente pra venda rápida - direto na API (o PDV não tem uma base
// local de pessoas como tem de produtos, e a venda rápida já vai online).
export function searchPeople(token: string, companyId: string, search: string) {
  return apiGet<Paginated<PersonRecord>>(
    '/people',
    { companyId, search, limit: '8', roles: '{2}' },
    token
  ).then((res) => res.data)
}
