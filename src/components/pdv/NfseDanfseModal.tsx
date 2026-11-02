import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/api'
import { fetchNfseDanfse } from '../../lib/nfce'
import { CloseIcon, DownloadIcon, PrinterIcon, WhatsappIcon } from '../icons'
import { NfceWhatsappModal } from './NfceWhatsappModal'

interface NfseDanfseModalProps {
  token: string
  companyId: string
  nfseId: string
  numero?: string | number | null
  defaultName?: string
  defaultPhone?: string
  onClose: () => void
  onSent?: (message: string) => void
}

// DANFSe de uma NFS-e autorizada: mostra o PDF gerado pelo backend, com imprimir,
// baixar e envio por WhatsApp (lista de NFS-e e histórico de vendas).
export function NfseDanfseModal({ token, companyId, nfseId, numero, defaultName, defaultPhone, onClose, onSent }: NfseDanfseModalProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [sentNote, setSentNote] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    fetchNfseDanfse(token, nfseId)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Não foi possível gerar o DANFSe.'))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [token, nfseId])

  function download() {
    if (!url) return
    const link = document.createElement('a')
    link.href = url
    link.download = `nfse-${numero || nfseId}.pdf`
    link.click()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !whatsappOpen) onClose()
          }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="flex flex-none items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
            <p className="text-[13.5px] font-bold text-[var(--ink)]">DANFSe{numero ? ` — NFS-e nº ${numero}` : ''}</p>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]"
              aria-label="Fechar"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 p-3">
            {!url && !error && (
              <div className="flex h-[60vh] flex-col items-center justify-center gap-3 rounded-xl bg-[var(--page)]">
                <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--blue-500)]" />
                <p className="text-[12.5px] text-[var(--muted)]">Gerando o DANFSe…</p>
              </div>
            )}
            {error && (
              <p className="rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>
            )}
            {url && (
              <iframe ref={frameRef} src={url} title="DANFSe" className="h-[60vh] w-full rounded-xl border border-[var(--border)] bg-white" />
            )}
            {sentNote && (
              <p className="mt-2 rounded-xl bg-[var(--green-100)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--green-600)]">{sentNote}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] p-3.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink-soft)]"
            >
              Fechar
            </button>
            {url && (
              <>
                <button
                  type="button"
                  onClick={() => frameRef.current?.contentWindow?.print()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink)]"
                >
                  <PrinterIcon className="h-4 w-4" /> Imprimir
                </button>
                <button
                  type="button"
                  onClick={download}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink)]"
                >
                  <DownloadIcon className="h-4 w-4" /> Baixar
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setWhatsappOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--green-600)] py-2.5 text-[13px] font-bold text-white"
            >
              <WhatsappIcon className="h-4 w-4" /> WhatsApp
            </button>
          </div>
        </div>
      </div>
      {whatsappOpen && (
        <NfceWhatsappModal
          token={token}
          companyId={companyId}
          nfeId={nfseId}
          kind="nfse"
          numero={numero}
          defaultName={defaultName}
          defaultPhone={defaultPhone}
          onClose={() => setWhatsappOpen(false)}
          onSent={(message) => {
            setWhatsappOpen(false)
            setSentNote(message)
            onSent?.(message)
          }}
        />
      )}
    </>
  )
}
