import { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { PrintDocument, PrintLine } from '../../lib/printing'
import { CloseIcon, PrinterIcon } from '../icons'

interface PrintPreviewModalProps {
  open: boolean
  title: string
  documents: PrintDocument[]
  onClose: () => void
}

const COLUMNS = 42

function Barcode({ value, type, height }: { value: string; type?: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current) return
    try {
      JsBarcode(ref.current, value, {
        format: type && type.startsWith('code39') ? 'CODE39' : 'CODE128',
        height: Math.max(30, Math.round((height ?? 60) * 0.8)),
        width: 2,
        displayValue: false,
        margin: 0,
      })
    } catch {
      // valor que o formato não aceita: deixa vazio, o texto do código vem logo abaixo
    }
  }, [value, type, height])
  return <svg ref={ref} className="mx-auto max-w-full" />
}

function Qr({ value }: { value: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { margin: 0, width: 220 })
      .then((result) => {
        if (!cancelled) setUrl(result)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [value])
  return url ? <img src={url} alt="QR Code" className="mx-auto h-36 w-36" /> : null
}

const alignClass = (align?: string) => (align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left')

function Line({ line }: { line: PrintLine }) {
  switch (line.t) {
    case 'text':
      return (
        <p
          className={`whitespace-pre-wrap break-words ${alignClass(line.align)} ${line.bold ? 'font-bold' : ''} ${line.underline ? 'underline' : ''}`}
          style={line.size && line.size > 1 ? { fontSize: `${Math.min(line.size, 3) * 100}%` } : undefined}
        >
          {line.v || ' '}
        </p>
      )
    case 'row':
      return (
        <p className={`flex justify-between gap-3 ${line.bold ? 'font-bold' : ''}`}>
          <span className="min-w-0 break-words">{line.l}</span>
          <span className="flex-none">{line.r}</span>
        </p>
      )
    case 'hr':
      return <p className="overflow-hidden whitespace-nowrap">{(line.c || '-').repeat(COLUMNS)}</p>
    case 'qr':
      return line.v ? <Qr value={line.v} /> : null
    case 'barcode':
      return line.v ? <Barcode value={line.v} type={line.type} height={line.height} /> : null
    case 'feed':
      return <div style={{ height: `${(line.n ?? 1) * 1.1}em` }} />
    case 'cut':
      return <p className="my-2 border-t border-dashed border-neutral-400" />
    default:
      return null
  }
}

// Mostra na tela o que sairia na impressora, para o PDV sem impressora
// vinculada (ou terminal de teste). O mesmo documento que iria para a fila.
export function PrintPreviewModal({ open, title, documents, onClose }: PrintPreviewModalProps) {
  const paperRef = useRef<HTMLDivElement>(null)

  if (!open) return null

  function handlePrint() {
    const html = paperRef.current?.innerHTML
    if (!html) return
    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    if (!doc) {
      frame.remove()
      return
    }
    doc.open()
    doc.write(
      `<html><head><title>${title}</title><style>
        @page { margin: 0 }
        body { margin: 0; padding: 4mm; width: 72mm; font: 12px/1.35 "Courier New", monospace; color: #000 }
        p { margin: 0 } .flex { display: flex; justify-content: space-between; gap: 8px }
        .text-center { text-align: center } .text-right { text-align: right } .font-bold { font-weight: 700 }
        .underline { text-decoration: underline } .mx-auto { display: block; margin: 0 auto; max-width: 100% }
        .paper-gap { border-top: 1px dashed #999; margin: 8px 0 }
      </style></head><body>${html}</body></html>`
    )
    doc.close()
    frame.contentWindow?.focus()
    setTimeout(() => {
      frame.contentWindow?.print()
      setTimeout(() => frame.remove(), 1000)
    }, 150)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92svh] w-full max-w-[420px] flex-col rounded-2xl bg-[var(--surface)] shadow-[var(--card-shadow)] focus:outline-none"
        tabIndex={-1}
        ref={(el) => el?.focus()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape' || event.key === 'Enter') {
            event.preventDefault()
            onClose()
          }
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4">
          <div>
            <h2 className="text-[15px] font-bold text-[var(--ink)]">{title}</h2>
            <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">
              Pré-visualização: este terminal não tem impressora vinculada.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--page)] hover:text-[var(--ink)]"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto bg-[var(--page)] p-4">
          <div
            ref={paperRef}
            className="mx-auto w-full max-w-[330px] bg-white p-4 font-mono text-[12px] leading-[1.35] text-black shadow"
          >
            {documents.map((document, index) => (
              <div key={index}>
                {index > 0 && <div className="paper-gap my-3 border-t border-dashed border-neutral-400" />}
                {document.lines.map((line, lineIndex) => (
                  <Line key={lineIndex} line={line} />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] p-3">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"
          >
            <PrinterIcon className="h-4 w-4" /> Imprimir pelo navegador
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[var(--blue-500)] px-5 py-2 text-[13px] font-bold text-white hover:bg-[var(--blue-700)]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
