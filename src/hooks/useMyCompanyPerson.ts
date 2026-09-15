import { useEffect, useState } from 'react'
import { fetchMyPerson } from '../lib/people'
import type { AuthSession, AuthCompany } from '../lib/auth'

interface MyCompanyPerson {
  id: string
  name: string
}

export function useMyCompanyPerson(session: AuthSession, company: AuthCompany) {
  const [person, setPerson] = useState<MyCompanyPerson | null>(null)

  useEffect(() => {
    let cancelled = false
    setPerson(null)

    fetchMyPerson(session.token.token, company.id)
      .then((result) => {
        if (!cancelled) setPerson({ id: result.id, name: result.name })
      })
      .catch(() => {
        if (!cancelled) setPerson(null)
      })

    return () => {
      cancelled = true
    }
  }, [session.token.token, company.id])

  return person
}
