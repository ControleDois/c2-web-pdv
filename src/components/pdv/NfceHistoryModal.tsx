import { useEffect, useState } from 'react'
import { fetchNfceHistory, generateNfceFromSale, nfceErrorMessage, waitNfceOutcome, type NfceHistoryItem } from '../../lib/nfce'
import { ApiError } from '../../lib/api'
import { CloseIcon, FileTextIcon, RefreshIcon } from '../icons'
import type { AuthSession, AuthCompany } from '../../lib/auth'

interface NfceHistoryModalProps {
  open: boolean
  session: AuthSession
  company: AuthCompany
  onClose: () => void
}

const STATUS_META: Record<number, { label: string; className: string }> = {
  1: { label: 'Processando', className: 'bg-[var(--amber-100)] text-[var(--amber-500)]' },
  2: { label: 'Autorizada', className: 'bg-[var(--green-100)] text-[var(--green-600)]' },
  3: { label: 'Erro', className: 'bg-[var(--red-100)] text-[var(--red-500)]' },
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// Histórico das NFC-e geradas pela venda rápida, direto no PDV: pra saber
// sem sair da tela se saiu autorizada, se ainda está processando, ou qual
// foi o erro - e tentar de novo sem precisar refazer a venda.
export function NfceHistoryModal({ open, session, company, onClose }: NfceHistoryModalProps) {
  const token = session.token.token
  const [items, setItems] = useState<NfceHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [retryNotice, setRetryNotice] = useState<Record<string, string>>({})

  function load() {
    setLoading(true)
    setError(null)
    fetchNfceHistory(token, company.id, { limit: 30 })
      .then((res) => setItems(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as NFC-e.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    setRetryNotice({})
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, company.id])

  if (!open) return null

  async function handleRetry(item: NfceHistoryItem) {
    if (!item.saleId || retryingId) return
    setRetryingId(item.id)
    setRetryNotice((current) => ({ ...current, [item.id]: 'Reenviando…' }))
    try {
      const result = await generateNfceFromSale(token, item.saleId)
      const nfeId = result.nfe?.id
      if (nfeId) {
        setRetryNotice((current) => ({ ...current, [item.id]: 'Aguardando a SEFAZ…' }))
        const outcome = await waitNfceOutcome(token, nfeId)
        setRetryNotice((current) => ({
          ...current,
          [item.id]: outcome.authorized ? 'Autorizada! Atualizando lista…' : outcome.message,
        }))
      }
      load()
    } catch (err) {
      setRetryNotice((current) => ({ ...current, [item.id]: nfceErrorMessage(err) }))
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl"
        tabIndex={-1}
        ref={(el) => el?.focus()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
      >
        <div className="flex flex-none items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <p className="flex items-center gap-2 text-[13.5px] font-bold text-[var(--ink)]">
            <FileTextIcon className="h-4 w-4" /> NFC-e emitidas
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)] disabled:opacity-60"
              title="Atualizar"
            >
              <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]"
              aria-label="Fechar"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="mb-3 text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}

          {loading && items.length === 0 ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-[var(--page)]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-[var(--muted)]">Nenhuma NFC-e gerada ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => {
                const meta = STATUS_META[item.status] ?? { label: '—', className: 'bg-[var(--page)] text-[var(--ink-soft)]' }
                return (
                  <div key={item.id} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-[var(--ink)]">
                          {item.numero ? `NFC-e nº ${item.numero}` : 'NFC-e'}
                          {item.serie ? ` · série ${item.serie}` : ''}
                        </p>
                        <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">
                          {item.people?.name || 'Consumidor'} · {formatDateTime(item.data_emissao || item.createdAt)}
                        </p>
                      </div>
                      <span className={`flex-none rounded-full px-2.5 py-1 text-[10.5px] font-bold ${meta.className}`}>
                        {meta.label}
                      </span>
                    </div>

                    {item.status === 3 && item.mensagem_sefaz && (
                      <p className="mt-2 rounded-lg bg-[var(--red-100)] px-3 py-2 text-[11.5px] text-[var(--red-500)]">
                        {item.mensagem_sefaz}
                      </p>
                    )}

                    {retryNotice[item.id] && (
                      <p className="mt-2 text-[11.5px] font-medium text-[var(--ink-soft)]">{retryNotice[item.id]}</p>
                    )}

                    {item.status === 3 && item.saleId && (
                      <button
                        type="button"
                        onClick={() => void handleRetry(item)}
                        disabled={retryingId === item.id}
                        className="mt-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--ink)] disabled:opacity-60"
                      >
                        {retryingId === item.id ? 'Reenviando…' : 'Tentar novamente'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
