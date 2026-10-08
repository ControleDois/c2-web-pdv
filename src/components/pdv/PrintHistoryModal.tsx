import { useEffect, useState } from 'react'
import { fetchActivePrinters, fetchPrintJobs, reprintJob, type PrintJobItem, type PrinterOption } from '../../lib/printing'
import { ApiError } from '../../lib/api'
import { CloseIcon, PrinterIcon, RefreshIcon } from '../icons'
import type { AuthSession, AuthCompany } from '../../lib/auth'

interface PrintHistoryModalProps {
  open: boolean
  session: AuthSession
  company: AuthCompany
  onClose: () => void
}

const STATUS_META: Record<number, { label: string; className: string }> = {
  0: { label: 'Na fila', className: 'bg-[var(--amber-100)] text-[var(--amber-500)]' },
  1: { label: 'Imprimindo', className: 'bg-[var(--amber-100)] text-[var(--amber-500)]' },
  2: { label: 'Impresso', className: 'bg-[var(--green-100)] text-[var(--green-600)]' },
  3: { label: 'Erro', className: 'bg-[var(--red-100)] text-[var(--red-500)]' },
  4: { label: 'Cancelado', className: 'bg-[var(--page)] text-[var(--ink-soft)]' },
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// Últimas impressões enviadas pelo PDV, com a opção de reimprimir (não saiu,
// acabou o papel, saiu cortado…). Dá para escolher outra impressora.
export function PrintHistoryModal({ open, session, company, onClose }: PrintHistoryModalProps) {
  const token = session.token.token
  const [jobs, setJobs] = useState<PrintJobItem[]>([])
  const [printers, setPrinters] = useState<PrinterOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const [targetPrinter, setTargetPrinter] = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [notices, setNotices] = useState<Record<string, string>>({})

  function load() {
    setLoading(true)
    setError(null)
    fetchPrintJobs(token, company.id, 30)
      .then(setJobs)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as impressões.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    setNotices({})
    setPicking(null)
    load()
    fetchActivePrinters(token, company.id)
      .then(setPrinters)
      .catch(() => setPrinters([]))
    // Atualiza sozinho: o operador vê o status mudar de "Na fila" para "Impresso".
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, company.id])

  if (!open) return null

  async function handleReprint(job: PrintJobItem, printerId?: string) {
    if (sendingId) return
    setSendingId(job.id)
    try {
      await reprintJob(token, job.id, printerId)
      setNotices((current) => ({ ...current, [job.id]: 'Enviado para a impressora novamente.' }))
      setPicking(null)
      load()
    } catch (err) {
      setNotices((current) => ({
        ...current,
        [job.id]: err instanceof ApiError ? err.message : 'Não foi possível reimprimir.',
      }))
    } finally {
      setSendingId(null)
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
            <PrinterIcon className="h-4 w-4" /> Impressões
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
          <p className="mb-3 text-[11.5px] text-[var(--ink-soft)]">
            Não saiu, acabou o papel ou saiu cortado? Toque em <b>Reimprimir</b>. Se a impressora estiver com problema, escolha outra.
          </p>
          {error && <p className="mb-3 text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}

          {loading && jobs.length === 0 ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-[var(--page)]" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-[var(--muted)]">Nenhuma impressão enviada ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {jobs.map((job) => {
                const meta = STATUS_META[job.status] ?? { label: '—', className: 'bg-[var(--page)] text-[var(--ink-soft)]' }
                return (
                  <div key={job.id} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-[var(--ink)]">{job.title || 'Documento'}</p>
                        <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">
                          {job.printer?.name ?? '—'} · {formatDateTime(job.created_at)}
                        </p>
                      </div>
                      <span className={`flex-none rounded-full px-2.5 py-1 text-[10.5px] font-bold ${meta.className}`}>{meta.label}</span>
                    </div>

                    {job.status === 3 && job.error && (
                      <p className="mt-2 rounded-lg bg-[var(--red-100)] px-3 py-2 text-[11.5px] text-[var(--red-500)]">{job.error}</p>
                    )}
                    {notices[job.id] && <p className="mt-2 text-[11.5px] font-medium text-[var(--ink-soft)]">{notices[job.id]}</p>}

                    {job.status !== 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleReprint(job)}
                          disabled={sendingId === job.id}
                          className="rounded-lg bg-[var(--blue-500)] px-3 py-1.5 text-[11.5px] font-bold text-white hover:bg-[var(--blue-700)] disabled:opacity-60"
                        >
                          {sendingId === job.id ? 'Enviando…' : 'Reimprimir'}
                        </button>
                        {printers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPicking(picking === job.id ? null : job.id)
                              setTargetPrinter(job.printer?.id ?? '')
                            }}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"
                          >
                            Em outra impressora…
                          </button>
                        )}
                      </div>
                    )}

                    {picking === job.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          value={targetPrinter}
                          onChange={(event) => setTargetPrinter(event.target.value)}
                          className="min-w-0 flex-1 rounded-lg bg-[var(--page)] px-3 py-2 text-[12.5px] text-[var(--ink)] focus:outline-none"
                        >
                          {printers.map((printer) => (
                            <option key={printer.id} value={printer.id}>
                              {printer.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleReprint(job, targetPrinter)}
                          disabled={sendingId === job.id || !targetPrinter}
                          className="flex-none rounded-lg bg-[var(--blue-500)] px-3 py-2 text-[11.5px] font-bold text-white hover:bg-[var(--blue-700)] disabled:opacity-60"
                        >
                          Enviar
                        </button>
                      </div>
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
