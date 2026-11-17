import { useMemo, useState, type MouseEvent } from 'react'
import { Logo } from '../components/Logo'
import { LegalFooter } from '../components/LegalFooter'
import { BuildingsIcon, ChevronRightIcon, LogoutIcon, SearchIcon } from '../components/icons'
import { formatCnpj } from '../lib/formatCnpj'
import {
  getCompanyName,
  getPersonName,
  saveSession,
  setFavoriteCompany,
  type AuthCompany,
  type AuthSession,
} from '../lib/auth'

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
    case 'inactive':
      return { label: 'Desativada', className: 'bg-[var(--page)] text-[var(--muted)]' }
    default:
      return null
  }
}

function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9L12 3.2z" />
    </svg>
  )
}

function CompanyAvatar({ company, size = 'h-10 w-10' }: { company: AuthCompany; size?: string }) {
  const imageUrl = company.people?.file_url
  return (
    <span className={`flex ${size} flex-none items-center justify-center overflow-hidden rounded-xl bg-[var(--surface)] text-[var(--blue-700)]`}>
      {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <BuildingsIcon className="h-5 w-5" />}
    </span>
  )
}

export function CompanySelectionPage({ session, companies, onSelect, onLogout }: CompanySelectionPageProps) {
  const [search, setSearch] = useState('')
  // Favoritas ficam no servidor (por usuário); aqui só o estado da tela, atualizado na hora.
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(companies.filter((company) => company.isFavorite).map((company) => company.id)))
  const [saving, setSaving] = useState<string | null>(null)

  const favoriteCompanies = useMemo(() => companies.filter((company) => favorites.has(company.id)), [companies, favorites])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = term ? companies.filter((company) => getCompanyName(company).toLowerCase().includes(term)) : companies
    // Sem busca, a lista mostra primeiro as que não estão na barra de favoritas.
    return term ? list : [...list.filter((company) => !favorites.has(company.id)), ...list.filter((company) => favorites.has(company.id))]
  }, [companies, search, favorites])

  const visible = filtered.slice(0, VISIBLE_LIMIT)
  const hiddenCount = filtered.length - visible.length

  async function toggleFavorite(event: MouseEvent, company: AuthCompany) {
    event.stopPropagation()
    const next = !favorites.has(company.id)
    const apply = (value: boolean) =>
      setFavorites((current) => {
        const copy = new Set(current)
        if (value) copy.add(company.id)
        else copy.delete(company.id)
        return copy
      })
    apply(next)
    setSaving(company.id)
    try {
      await setFavoriteCompany(session.token.token, company.id, next)
      // Guarda na sessão do aparelho também, para a barra já abrir certa na próxima vez.
      const updated = (session.user.companies ?? []).map((item: AuthCompany) => (item.id === company.id ? { ...item, isFavorite: next } : item))
      saveSession({ ...session, user: { ...session.user, companies: updated } })
    } catch {
      apply(!next)
    } finally {
      setSaving(null)
    }
  }

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
            <h1 className="text-[17px] font-bold tracking-tight text-[var(--ink)]">Olá, {getPersonName(session.user)}</h1>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">Em qual empresa você quer trabalhar?</p>
          </div>
        </div>

        {favoriteCompanies.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-[11.5px] font-bold tracking-wide text-[var(--muted)] uppercase">
              <StarIcon filled className="h-3.5 w-3.5 text-amber-400" />
              Favoritas
            </p>
            <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              {favoriteCompanies.map((company) => (
                <div key={company.id} className="relative w-[148px] flex-none snap-start sm:w-auto">
                  <button
                    type="button"
                    onClick={() => onSelect(company)}
                    className="flex h-full w-full flex-col items-start gap-2 rounded-2xl bg-[var(--surface)] p-3.5 text-left shadow-[var(--card-shadow)] ring-1 ring-transparent transition hover:-translate-y-0.5 hover:ring-[var(--blue-300)]"
                  >
                    <CompanyAvatar company={company} size="h-9 w-9" />
                    <span className="line-clamp-2 text-[13px] leading-snug font-bold text-[var(--ink)]">{getCompanyName(company)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => void toggleFavorite(event, company)}
                    disabled={saving === company.id}
                    aria-label={`Tirar ${getCompanyName(company)} das favoritas`}
                    className="absolute top-2 right-2 rounded-full p-1.5 text-amber-400 transition hover:bg-[var(--page)] disabled:opacity-50"
                  >
                    <StarIcon filled className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
            <p className="px-1 py-2 text-center text-[13px] text-[var(--muted)]">Nenhuma empresa encontrada para "{search}".</p>
          )}

          {visible.map((company) => {
            const badge = licenseBadge(company)
            const document = company.people?.document
            const favorite = favorites.has(company.id)

            return (
              <div
                key={company.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(company)}
                onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && onSelect(company)}
                className="flex cursor-pointer items-center gap-3 rounded-2xl bg-[var(--page)] p-4 text-left transition hover:bg-[var(--blue-100)]"
              >
                <CompanyAvatar company={company} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="max-w-full truncate text-[14px] font-bold text-[var(--ink)]">{getCompanyName(company)}</span>
                    {badge && (
                      <span className={`flex-none rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-wide uppercase ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                  </span>
                  {document && <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{formatCnpj(document)}</span>}
                </span>
                <button
                  type="button"
                  onClick={(event) => void toggleFavorite(event, company)}
                  disabled={saving === company.id}
                  aria-label={favorite ? `Tirar ${getCompanyName(company)} das favoritas` : `Marcar ${getCompanyName(company)} como favorita`}
                  title={favorite ? 'Tirar das favoritas' : 'Marcar como favorita'}
                  className={`flex-none rounded-full p-2 transition hover:bg-[var(--surface)] disabled:opacity-50 ${
                    favorite ? 'text-amber-400' : 'text-[var(--muted)] hover:text-amber-400'
                  }`}
                >
                  <StarIcon filled={favorite} className="h-[18px] w-[18px]" />
                </button>
                <ChevronRightIcon className="h-4 w-4 flex-none text-[var(--muted)]" />
              </div>
            )
          })}

          {hiddenCount > 0 && (
            <p className="px-1 text-center text-[12px] text-[var(--muted)]">
              Mostrando {visible.length} de {filtered.length} — refine a busca para ver as outras.
            </p>
          )}

          {favoriteCompanies.length === 0 && companies.length > 1 && (
            <p className="px-1 text-center text-[11.5px] text-[var(--muted)]">
              Toque na <StarIcon filled={false} className="inline h-3.5 w-3.5 align-[-2px]" /> para deixar uma empresa sempre à mão no topo.
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
