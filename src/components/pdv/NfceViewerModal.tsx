import { useEffect, useRef, useState } from 'react'
import { fetchNfceDetails, fetchNfceQrCode, type NfceDetails, type NfceHistoryItem } from '../../lib/nfce'
import { buildNfceDocument, createPrintJob } from '../../lib/printing'
import { ApiError } from '../../lib/api'
import { NfcePrintPortal, NfceReceipt } from './NfceReceipt'
import { CloseIcon, WhatsappIcon } from '../icons'

interface NfceViewerModalProps {
  token: string
  companyId: string
  item: NfceHistoryItem
  // Impressora da NFC-e cadastrada: se houver, "Imprimir" manda direto pra ela; senão abre a impressão do navegador.
  printerId?: string | null
  onWhatsapp: (item: NfceHistoryItem) => void
  onClose: () => void
}

// Abre de novo o cupom (DANFE) de uma NFC-e já autorizada, para conferir, imprimir ou enviar no WhatsApp.
export function NfceViewerModal({ token, companyId, item, printerId, onWhatsapp, onClose }: NfceViewerModalProps) {
  const [details, setDetails] = useState<NfceDetails | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([fetchNfceDetails(token, item.id), fetchNfceQrCode(token, item.id).catch(() => null)])
      .then(([loaded, qr]) => {
        if (cancelled) return
        setDetails(loaded)
        setQrCodeUrl(qr?.url ?? null)
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Não foi possível abrir a NFC-e.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [token, item.id])

  async function handlePrint() {
    if (!details || printing) return
    if (!printerId) {
      window.print()
      return
    }
    setPrinting(true)
    setNotice('Enviando para a impressora…')
    try {
      await createPrintJob(token, {
        company_id: companyId,
        printer_id: printerId,
        title: `NFC-e nº ${details.numero}`,
        payload: buildNfceDocument(details, qrCodeUrl),
      })
      setNotice('Enviada para a impressora.')
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'Não foi possível enviar para a impressora.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      tabIndex={-1}
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        } else if (event.key === 'Enter' && details && !(event.target instanceof HTMLButtonElement)) {
          event.preventDefault()
          void handlePrint()
        }
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-none items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <p className="text-[13.5px] font-bold text-[var(--ink)]">NFC-e{item.numero ? ` nº ${item.numero}` : ''}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--page)]"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-[var(--page)] p-5">
          {loading && <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--blue-500)]" />}
          {error && <p className="rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}
          {details && (
            <div className="mx-auto w-fit rounded-lg bg-white p-3 shadow-sm">
              <NfceReceipt nfce={details} qrCodeUrl={qrCodeUrl} />
            </div>
          )}
        </div>

        {notice && <p className="border-t border-[var(--border)] px-5 py-2 text-center text-[12.5px] font-semibold text-[var(--ink-soft)]">{notice}</p>}

        <div className="flex flex-none gap-2 border-t border-[var(--border)] p-3.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink-soft)]"
          >
            Fechar (Esc)
          </button>
          <button
            type="button"
            onClick={() => onWhatsapp(item)}
            disabled={!details}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-bold text-[var(--green-600)] disabled:opacity-50"
          >
            <WhatsappIcon className="h-4 w-4" /> WhatsApp
          </button>
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={!details || printing}
            className="flex-1 rounded-xl bg-[var(--blue-500)] py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            Imprimir (Enter)
          </button>
        </div>
      </div>
      {details && <NfcePrintPortal nfce={details} qrCodeUrl={qrCodeUrl} />}
    </div>
  )
}
