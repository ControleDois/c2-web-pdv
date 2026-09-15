import { useMemo, useState } from 'react'
import { Logo } from '../components/Logo'
import { LegalFooter } from '../components/LegalFooter'
import { BuildingsIcon, ChevronRightIcon, LogoutIcon, SearchIcon } from '../components/icons'
import { formatCnpj } from '../lib/formatCnpj'
import { getCompanyName, getPersonName, type AuthCompany, type AuthSession } from '../lib/auth'

const VISIBLE_LIMIT = 3

interface CompanySelectionPageProps {
  session: AuthSession
  companies: AuthCompany[]
  onSelect: (company: AuthCompany) => void
  onLogout: () => void
}

function licenseBadge(company: AuthCompany) {
  switch (company.license_status) {
    case 'trial':
      return { label: 'Teste grátis', className: 'bg-[var(--blue-100)] text-[var(--blue-700)]' }
    case 'active':
      return { label: 'Ativa', className: 'bg-[var(--green-100)] text-[var(--green-600)]' }
    case 'blocked':
      return { label: 'Bloqueada', className: 'bg-[var(--red-100)] text-[var(--red-500)]' }
    default:
      return null
  }
}

export function CompanySelectionPage({ session, companies, onSelect, onLogout }: CompanySelectionPageProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return companies
    return companies.filter((company) => getCompanyName(company).toLowerCase().includes(term))
  }, [companies, search])

  const visible = filtered.slice(0, VISIBLE_LIMIT)
  const hiddenCount = filtered.length - visible.length

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[var(--page)] px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--blue-100), transparent 70%)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-16 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--green-100), transparent 70%)' }}
      />

      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="h-16 w-16" />
          <div>
            <h1 className="text-[17px] font-bold tracking-tight text-[var(--ink)]">
              Olá, {getPersonName(session.user)}
            </h1>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">Em qual empresa você quer trabalhar?</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-[28px] bg-[var(--surface)] p-6 shadow-[var(--card-shadow)]">
          {companies.length > VISIBLE_LIMIT && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--page)] px-3.5 py-2.5 ring-1 ring-transparent transition focus-within:ring-[var(--blue-300)]">
              <SearchIcon className="h-4 w-4 flex-none text-[var(--muted)]" />
              <input
                type="text"
                placeholder="Buscar empresa pelo nome"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full bg-transparent text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
              />
            </div>
          )}

          {visible.length === 0 && (
            <p className="px-1 py-2 text-center text-[13px] text-[var(--muted)]">
              Nenhuma empresa encontrada para "{search}".
            </p>
          )}

          {visible.map((company) => {
            const badge = licenseBadge(company)
            const document = company.people?.document
            const imageUrl = company.people?.file_url

            return (
              <button
                key={company.id}
                type="button"
                onClick={() => onSelect(company)}
                className="flex items-center gap-3 rounded-2xl bg-[var(--page)] p-4 text-left transition hover:bg-[var(--blue-100)]"
              >
                <span className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-xl bg-[var(--surface)] text-[var(--blue-700)]">
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <BuildingsIcon className="h-5 w-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-bold text-[var(--ink)]">
                      {getCompanyName(company)}
                    </span>
                    {badge && (
                      <span
                        className={`flex-none rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-wide uppercase ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </span>
                  {document && (
                    <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{formatCnpj(document)}</span>
                  )}
                </span>
                <ChevronRightIcon className="h-4 w-4 flex-none text-[var(--muted)]" />
              </button>
            )
          })}

          {hiddenCount > 0 && (
            <p className="px-1 text-center text-[12px] text-[var(--muted)]">
              Mostrando {visible.length} de {filtered.length} — refine a busca para ver as outras.
            </p>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[12.5px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]"
          >
            <LogoutIcon className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>

        <LegalFooter />
      </div>
    </div>
  )
}
