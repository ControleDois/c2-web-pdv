import { useCallback, useEffect, useState } from 'react'
import {
  buildNfceDocument,
  buildQuickSaleDocument,
  createPrintJob,
  fetchQuickSales,
  reprintSaleTokens,
  type PrintDocument,
  type QuickSaleItem,
} from '../lib/printing'
import { fetchNfceDetails, fetchNfceQrCode } from '../lib/nfce'
import { ApiError } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { PrinterIcon, RefreshIcon, SearchIcon } from '../components/icons'
import type { AuthSession, AuthCompany } from '../lib/auth'
import type { PdvPrinters } from '../lib/terminal'
import { PrintPreviewModal } from '../components/pdv/PrintPreviewModal'

interface SalesHistoryPageProps {
  session: AuthSession
  company: AuthCompany
  printers: PdvPrinters
}

const NFCE_META: Record<number, { label: string; className: string }> = {
  1: { label: 'NFC-e processando', className: 'bg-[var(--amber-100)] text-[var(--amber-500)]' },
  2: { label: 'NFC-e autorizada', className: 'bg-[var(--green-100)] text-[var(--green-600)]' },
  3: { label: 'NFC-e com erro', className: 'bg-[var(--red-100)] text-[var(--red-500)]' },
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// Vendas rápidas recentes, com a reimpressão de tudo que a venda gerou:
// comprovante (2ª via), NFC-e e fichas. Sai nas impressoras configuradas em
// Ajustes > Venda Rápida; o resultado aparece em Impressões.
export function SalesHistoryPage({ session, company, printers }: SalesHistoryPageProps) {
  const token = session.token.token
  const { receiptPrinterId, nfcePrinterId } = printers
  const [preview, setPreview] = useState<{ title: string; documents: PrintDocument[] } | null>(null)

  const [sales, setSales] = useState<QuickSaleItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [notices, setNotices] = useState<Record<string, { text: string; error: boolean }>>({})

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchQuickSales(token, company.id, { search, limit: 40 })
      .then(setSales)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as vendas.'))
      .finally(() => setLoading(false))
  }, [token, company.id, search])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  function setNotice(key: string, text: string, isError = false) {
    setNotices((current) => ({ ...current, [key]: { text, error: isError } }))
  }

  async function run(sale: QuickSaleItem, action: 'receipt' | 'nfce' | 'tokens') {
    const key = `${sale.id}:${action}`
    if (busyKey) return
    setBusyKey(key)
    setNotice(sale.id, 'Enviando para a impressora…')
    try {
      if (action === 'receipt') {
        const title = `Venda rápida #${sale.code} (2ª via)`
        const document = buildQuickSaleDocument(
            {
              companyName: company.people?.name || 'Controle Dois',
              companyDocument: company.people?.document,
              code: sale.code,
              date: sale.created_at,
              clientName: sale.client_name,
              items: sale.items.map((item) => ({ name: item.name, quantity: item.quantity, unitValue: item.unit_value, total: item.total })),
              total: sale.total,
              payments: sale.payments,
              change: 0,
            },
            { secondCopy: true }
          )
        if (receiptPrinterId) {
          await createPrintJob(token, { company_id: company.id, printer_id: receiptPrinterId, title, payload: document })
          setNotice(sale.id, 'Comprovante enviado para a impressora.')
        } else {
          setPreview({ title, documents: [document] })
          setNotice(sale.id, '')
        }
      } else if (action === 'nfce') {
        if (!sale.nfce) throw new Error('no-nfce')
        const [details, qrCode] = await Promise.all([
          fetchNfceDetails(token, sale.nfce.id),
          fetchNfceQrCode(token, sale.nfce.id).catch(() => null),
        ])
        const title = `NFC-e nº ${details.numero} (reimpressão)`
        const document = buildNfceDocument(details, qrCode?.url ?? null)
        if (nfcePrinterId) {
          await createPrintJob(token, { company_id: company.id, printer_id: nfcePrinterId, title, payload: document })
          setNotice(sale.id, 'NFC-e enviada para a impressora.')
        } else {
          setPreview({ title, documents: [document] })
          setNotice(sale.id, '')
        }
      } else {
        const result = await reprintSaleTokens(token, company.id, sale.id, receiptPrinterId)
        if (!result.printed && result.documents?.length) {
          setPreview({ title: `Fichas — venda #${sale.code}`, documents: result.documents })
          setNotice(sale.id, '')
        } else {
          setNotice(sale.id, `${result.tokens} ficha${result.tokens === 1 ? '' : 's'} enviada${result.tokens === 1 ? '' : 's'} para a impressora.`)
        }
      }
    } catch (err) {
      setNotice(
        sale.id,
        err instanceof ApiError ? err.message : 'Não foi possível enviar para a impressora.',
        true
      )
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-bold text-[var(--ink)]">Vendas</h1>
          <p className="text-[12.5px] text-[var(--ink-soft)]">Reimprima o comprovante, a NFC-e e as fichas de uma venda.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <SearchIcon className="h-4 w-4 text-[var(--muted)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="Nº da venda"
              className="w-28 bg-transparent text-[13px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            title="Atualizar"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--ink-soft)] hover:text-[var(--ink)] disabled:opacity-60"
          >
            <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!receiptPrinterId && !nfcePrinterId && (
        <p className="mb-3 rounded-xl bg-[var(--blue-100)] px-4 py-3 text-[12.5px] font-medium text-[var(--blue-700)]">
          Sem impressora vinculada a este terminal: a reimpressão mostra o preview na tela.
        </p>
      )}
      <PrintPreviewModal
        open={preview !== null}
        title={preview?.title ?? ''}
        documents={preview?.documents ?? []}
        onClose={() => setPreview(null)}
      />
      {error && <p className="mb-3 text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5">
        {loading && sales.length === 0 ? (
          Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-[var(--surface)]" />)
        ) : sales.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-[var(--muted)]">Nenhuma venda rápida encontrada.</p>
        ) : (
          sales.map((sale) => {
            const meta = sale.nfce ? NFCE_META[sale.nfce.status] : null
            const notice = notices[sale.id]
            const tokensTotal = sale.tokens.issued + sale.tokens.redeemed + sale.tokens.canceled
            return (
              <div key={sale.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-[var(--ink)]">
                      Venda #{sale.code} <span className="ml-1 font-semibold text-[var(--ink-soft)]">{formatCurrency(sale.total)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-[var(--muted)]">
                      {formatDateTime(sale.created_at)} · {sale.client_name || 'Consumidor'} ·{' '}
                      {sale.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {meta && <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${meta.className}`}>{meta.label}</span>}
                    {tokensTotal > 0 && (
                      <span className="rounded-full bg-[var(--blue-100)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--blue-700)]">
                        {tokensTotal} ficha{tokensTotal === 1 ? '' : 's'}
                        {sale.tokens.redeemed ? ` · ${sale.tokens.redeemed} trocada${sale.tokens.redeemed === 1 ? '' : 's'}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void run(sale, 'receipt')}
                    disabled={Boolean(busyKey)}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--blue-500)] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[var(--blue-700)] disabled:opacity-60"
                  >
                    <PrinterIcon className="h-3.5 w-3.5" /> Comprovante
                  </button>
                  {sale.nfce?.status === 2 && (
                    <button
                      type="button"
                      onClick={() => void run(sale, 'nfce')}
                      disabled={Boolean(busyKey)}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--blue-500)] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[var(--blue-700)] disabled:opacity-60"
                    >
                      <PrinterIcon className="h-3.5 w-3.5" /> NFC-e
                    </button>
                  )}
                  {sale.tokens.issued > 0 && (
                    <button
                      type="button"
                      onClick={() => void run(sale, 'tokens')}
                      disabled={Boolean(busyKey)}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--blue-500)] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[var(--blue-700)] disabled:opacity-60"
                    >
                      <PrinterIcon className="h-3.5 w-3.5" /> Fichas ({sale.tokens.issued})
                    </button>
                  )}
                  {notice && (
                    <span className={`text-[11.5px] font-medium ${notice.error ? 'text-[var(--red-500)]' : 'text-[var(--ink-soft)]'}`}>
                      {notice.text}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
