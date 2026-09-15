import { useEffect, useState } from 'react'
import { fetchProducts } from '../lib/products'
import { clearProducts, batchInsertProducts, countProducts } from '../lib/db'
import { ApiError } from '../lib/api'
import { RefreshIcon, CheckCircleIcon, ChevronLeftIcon } from '../components/icons'
import type { AuthSession, AuthCompany } from '../lib/auth'

interface ProductSyncPageProps {
  session: AuthSession
  company: AuthCompany
  onReady: () => void
  /** Renderiza dentro de Configurações (sem o gate "Iniciar venda" e sem
   * ocupar a tela inteira) em vez do fluxo de primeira sincronização. */
  embedded?: boolean
  onBack?: () => void
}

const PAGE_SIZE = 100

// Porte do painel "Abertura de caixa" do PDV Angular (só a parte de
// produtos — o PDV Food não usa cliente/categoria) — baixa o catálogo
// inteiro pro IndexedDB antes de liberar a venda, pra busca de produto
// funcionar offline durante o atendimento.
export function ProductSyncPage({ session, company, onReady, embedded, onBack }: ProductSyncPageProps) {
  const [syncing, setSyncing] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [downloaded, setDownloaded] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [cachedCount, setCachedCount] = useState<number | null>(null)

  useEffect(() => {
    countProducts().then(setCachedCount)
  }, [])

  async function handleSync() {
    setSyncing(true)
    setError(null)
    setCompleted(false)
    setDownloaded(0)

    try {
      await clearProducts()

      let currentPage = 1
      let lastPage = 1
      let downloadedSoFar = 0

      do {
        setPage(currentPage)
        const res = await fetchProducts(session.token.token, company.id, {
          page: currentPage,
          limit: PAGE_SIZE,
        })
        const items = res.data || []
        lastPage = res.meta?.last_page ?? 1
        setTotalPages(lastPage)
        setTotal(res.meta?.total ?? items.length)

        if (items.length > 0) {
          await batchInsertProducts(
            items.map((product) => ({
              id: product.id,
              code: product.internal_code ?? product.code,
              barcode: product.barcode,
              name: product.name,
              sale_value: product.sale_value,
              unit: product.unit,
            }))
          )
          downloadedSoFar += items.length
          setDownloaded(downloadedSoFar)
        }

        currentPage += 1
      } while (currentPage <= lastPage)

      setCompleted(true)
      setCachedCount(downloadedSoFar)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível baixar os produtos.')
    } finally {
      setSyncing(false)
    }
  }

  const progress = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0

  const card = (
    <div className={embedded ? 'w-full max-w-[480px]' : 'w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6'}>
      {!embedded && <h1 className="text-[16px] font-bold text-[var(--ink)]">Sincronização local</h1>}
      <p className="mt-1 text-[13px] text-[var(--ink-soft)]">
        Baixa o cardápio pro dispositivo antes de começar a vender — a comanda funciona offline
        depois disso.
      </p>

      {cachedCount !== null && cachedCount > 0 && !syncing && !completed && (
        <p className="mt-3 text-[12.5px] text-[var(--muted)]">
          {cachedCount} produto{cachedCount === 1 ? '' : 's'} já salvos localmente de uma sincronização anterior.
        </p>
      )}

      {syncing && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--page)]">
            <div
              className="h-full rounded-full bg-[var(--blue-500)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[12px] text-[var(--muted)]">
            Página {page} de {totalPages} — {downloaded} de {total || '…'} produtos
          </p>
        </div>
      )}

      {completed && !syncing && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--green-100)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--green-600)]">
          <CheckCircleIcon className="h-4 w-4" />
          {downloaded} produtos atualizados com sucesso.
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-500)]">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center justify-center gap-2 rounded-xl bg-[var(--blue-500)] py-3 text-[14px] font-bold text-white transition hover:bg-[var(--blue-700)] disabled:opacity-60"
        >
          <RefreshIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando…' : 'Atualizar produtos'}
        </button>
        {!embedded && (
          <button
            type="button"
            onClick={onReady}
            disabled={syncing || (cachedCount === 0 && !completed)}
            className="rounded-xl border border-[var(--border)] py-3 text-[14px] font-bold text-[var(--ink)] transition hover:bg-[var(--page)] disabled:opacity-40"
          >
            Iniciar venda
          </button>
        )}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="flex h-full flex-col gap-5 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)] md:hidden"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
          )}
          <h1 className="text-[16px] font-bold text-[var(--ink)]">Configurações</h1>
        </div>
        {card}
      </div>
    )
  }

  return (
    <div className="flex h-svh flex-col items-center justify-center gap-6 bg-[var(--page)] p-6">{card}</div>
  )
}
