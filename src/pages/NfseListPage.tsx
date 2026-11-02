import { useEffect, useState } from 'react'
import {
  fetchNfseHistory,
  fetchNfseLogs,
  formatNfceLogPayload,
  nfseErrorMessage,
  resendNfse,
  type NfseHistoryItem,
  type NfceLogRecord,
} from '../lib/nfce'
import { ApiError } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { CloseIcon, ClipboardCheckIcon, FileTextIcon, RefreshIcon, WhatsappIcon } from '../components/icons'
import { NfseDanfseModal } from '../components/pdv/NfseDanfseModal'
import { NfceWhatsappModal } from '../components/pdv/NfceWhatsappModal'
import type { AuthSession, AuthCompany } from '../lib/auth'

interface NfseListPageProps {
  session: AuthSession
  company: AuthCompany
}

const STATUS_META: Record<number, { label: string; className: string }> = {
  0: { label: 'Rascunho', className: 'bg-[var(--page)] text-[var(--ink-soft)]' },
  1: { label: 'Processando', className: 'bg-[var(--amber-100)] text-[var(--amber-500)]' },
  2: { label: 'Autorizada', className: 'bg-[var(--green-100)] text-[var(--green-600)]' },
  3: { label: 'Erro', className: 'bg-[var(--red-100)] text-[var(--red-500)]' },
  4: { label: 'Cancelada', className: 'bg-[var(--page)] text-[var(--muted)]' },
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// Menu "NFS-e" - mesmo papel da lista de NFC-e: status, erro, reenvio, logs e,
// para as autorizadas, o DANFSe (imprimir, baixar, WhatsApp).
export function NfseListPage({ session, company }: NfseListPageProps) {
  const token = session.token.token
  const [items, setItems] = useState<NfseHistoryItem[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Record<string, string>>({})
  const [danfseTarget, setDanfseTarget] = useState<NfseHistoryItem | null>(null)
  const [whatsappTarget, setWhatsappTarget] = useState<NfseHistoryItem | null>(null)
  const [logsTarget, setLogsTarget] = useState<NfseHistoryItem | null>(null)
  const [logs, setLogs] = useState<NfceLogRecord[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  function load(targetPage: number) {
    setLoading(true)
    setError(null)
    fetchNfseHistory(token, company.id, { page: targetPage, limit: 20 })
      .then((res) => {
        setItems(res.data)
        setPage(res.meta.current_page)
        setLastPage(res.meta.last_page)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as NFS-e.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, company.id])

  async function handleResend(item: NfseHistoryItem) {
    if (busyId) return
    setBusyId(item.id)
    setNotice((current) => ({ ...current, [item.id]: 'Reenviando…' }))
    try {
      await resendNfse(token, item.id)
      setNotice((current) => ({ ...current, [item.id]: 'Reenviada — atualizando…' }))
      load(page)
    } catch (err) {
      setNotice((current) => ({ ...current, [item.id]: nfseErrorMessage(err) }))
    } finally {
      setBusyId(null)
    }
  }

  function openLogs(item: NfseHistoryItem) {
    setLogsTarget(item)
    setLogsLoading(true)
    fetchNfseLogs(token, item.id)
      .then((res) => setLogs(res || []))
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false))
  }

  const customerName = (item: NfseHistoryItem) => item.razao_social_tomador || item.people?.name || 'Consumidor'
  const customerPhone = (item: NfseHistoryItem) => String(item.telefone_tomador || item.people?.phone || '') || undefined

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[var(--indigo-100)] text-[var(--indigo-500)]">
            <FileTextIcon className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-[18px] font-bold text-[var(--ink)]">NFS-e</h1>
            <p className="text-[12.5px] text-[var(--ink-soft)]">Notas de serviço - status, erro, reenvio, DANFSe e logs</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load(page)}
          disabled={loading}
          title="Atualizar"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--ink-soft)] hover:text-[var(--ink)] disabled:opacity-60"
        >
          <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-500)]">
          {error}
        </p>
      )}

      {loading && items.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-[var(--surface)]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-[var(--muted)]">Nenhuma NFS-e gerada ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const meta = STATUS_META[item.status] ?? { label: '—', className: 'bg-[var(--page)] text-[var(--ink-soft)]' }
            const canResend = item.status === 0 || item.status === 3
            const authorized = item.status === 2 || item.status === 4
            const total = Number(item.valor_servico || 0) - Number(item.desconto_incondicionado || 0)
            return (
              <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold text-[var(--ink)]">
                      {item.numero_nfse ? `NFS-e nº ${item.numero_nfse}` : 'NFS-e'}
                      {item.numero_dps ? <span className="font-semibold text-[var(--muted)]"> · DPS {item.numero_dps}</span> : null}
                      {item.sale?.code ? <span className="font-semibold text-[var(--muted)]"> · venda #{item.sale.code}</span> : null}
                    </p>
                    <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">
                      {customerName(item)} · {formatDateTime(item.data_emissao || item.created_at)}
                    </p>
                    {item.descricao_servico && (
                      <p className="mt-0.5 truncate text-[11.5px] text-[var(--ink-soft)]">{item.descricao_servico}</p>
                    )}
                  </div>
                  <div className="flex flex-none flex-col items-end gap-1">
                    <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${meta.className}`}>{meta.label}</span>
                    {total > 0 && <span className="text-[12px] font-bold text-[var(--ink)]">{formatCurrency(total)}</span>}
                  </div>
                </div>

                {item.status === 3 && item.mensagem_sefaz && (
                  <p className="mt-2 rounded-lg bg-[var(--red-100)] px-3 py-2 text-[11.5px] text-[var(--red-500)]">
                    {item.mensagem_sefaz}
                  </p>
                )}

                {notice[item.id] && (
                  <p className="mt-2 text-[11.5px] font-medium text-[var(--ink-soft)]">{notice[item.id]}</p>
                )}

                <div className="mt-2.5 flex flex-wrap gap-2">
                  {authorized && (
                    <button
                      type="button"
                      onClick={() => setDanfseTarget(item)}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--blue-500)] px-2.5 py-1.5 text-[11.5px] font-bold text-white hover:bg-[var(--blue-700)]"
                    >
                      <FileTextIcon className="h-3.5 w-3.5" />
                      DANFSe
                    </button>
                  )}
                  {item.status === 2 && (
                    <button
                      type="button"
                      onClick={() => setWhatsappTarget(item)}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--green-600)] px-2.5 py-1.5 text-[11.5px] font-bold text-[var(--green-600)] hover:bg-[var(--green-100)]"
                    >
                      <WhatsappIcon className="h-3.5 w-3.5" />
                      WhatsApp
                    </button>
                  )}
                  {canResend && (
                    <button
                      type="button"
                      onClick={() => void handleResend(item)}
                      disabled={busyId === item.id}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11.5px] font-bold text-[var(--ink)] hover:bg-[var(--page)] disabled:opacity-60"
                    >
                      <RefreshIcon className={`h-3.5 w-3.5 ${busyId === item.id ? 'animate-spin' : ''}`} />
                      Reenviar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openLogs(item)}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11.5px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"
                  >
                    <ClipboardCheckIcon className="h-3.5 w-3.5" />
                    Ver logs
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {lastPage > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => load(page - 1)}
            disabled={loading || page <= 1}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-soft)] disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-[12px] text-[var(--muted)]">
            Página {page} de {lastPage}
          </span>
          <button
            type="button"
            onClick={() => load(page + 1)}
            disabled={loading || page >= lastPage}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-soft)] disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}

      {danfseTarget && (
        <NfseDanfseModal
          token={token}
          companyId={company.id}
          nfseId={danfseTarget.id}
          numero={danfseTarget.numero_nfse}
          defaultName={customerName(danfseTarget)}
          defaultPhone={customerPhone(danfseTarget)}
          onClose={() => setDanfseTarget(null)}
        />
      )}

      {whatsappTarget && (
        <NfceWhatsappModal
          token={token}
          companyId={company.id}
          nfeId={whatsappTarget.id}
          kind="nfse"
          numero={whatsappTarget.numero_nfse}
          defaultName={customerName(whatsappTarget)}
          defaultPhone={customerPhone(whatsappTarget)}
          onClose={() => setWhatsappTarget(null)}
          onSent={(message) => {
            setNotice((current) => ({ ...current, [whatsappTarget.id]: message }))
            setWhatsappTarget(null)
          }}
        />
      )}

      {logsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setLogsTarget(null)}>
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-none items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
              <div>
                <p className="text-[13.5px] font-bold text-[var(--ink)]">
                  Logs {logsTarget.numero_nfse ? `— NFS-e nº ${logsTarget.numero_nfse}` : ''}
                </p>
                <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">{logsTarget.razao_social_tomador || logsTarget.people?.name || 'Consumidor'}</p>
              </div>
              <button
                type="button"
                onClick={() => setLogsTarget(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]"
                aria-label="Fechar"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {logsLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-xl bg-[var(--page)]" />
                  ))}
                </div>
              ) : logs.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-[var(--muted)]">Nenhum log registrado.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-[var(--border)] p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-[var(--page)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--ink)]">
                          {log.action || log.phase || 'evento'}
                        </span>
                        {log.status !== null && log.status !== undefined && (
                          <span className="rounded-full bg-[var(--blue-100)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--blue-700)]">
                            Status {log.status}
                          </span>
                        )}
                        {log.httpStatus && (
                          <span className="rounded-full bg-[var(--page)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--ink-soft)]">
                            HTTP {log.httpStatus}
                          </span>
                        )}
                        <span className="ml-auto text-[10.5px] text-[var(--muted)]">{formatDateTime(log.createdAt)}</span>
                      </div>
                      {log.errorMessage && (
                        <p className="mt-2 rounded-lg bg-[var(--red-100)] px-2.5 py-1.5 text-[11.5px] text-[var(--red-500)]">
                          {log.errorMessage}
                        </p>
                      )}
                      {log.responsePayload && (
                        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-[var(--page)] p-2 text-[10.5px] text-[var(--ink-soft)]">
                          {formatNfceLogPayload(log.responsePayload)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
