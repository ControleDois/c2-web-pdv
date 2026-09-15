import { apiGet } from './api'

export interface PersonRecord {
  id: string
  name: string
  [key: string]: unknown
}

export function fetchMyPerson(token: string, companyId: string) {
  return apiGet<PersonRecord>('/people/me', { companyId }, token)
}
