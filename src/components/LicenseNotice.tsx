import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { fetchLicenseNotice, type LicenseNotice as LicenseNoticeData } from '../lib/licenseNotice'
import { formatCurrency } from '../lib/format'
import { AlertTriangleIcon, CloseIcon, CopyIcon, FileTextIcon } from './icons'
import type { AuthCompany, AuthSession } from '../lib/auth'

interface LicenseNoticeProps {
  session: AuthSession
  company: AuthCompany
}

const REFRESH_MS = 30 * 60 * 1000

// A data vem como yyyy-MM-dd: monta direto, sem Date (que deslocaria o dia pelo fuso).
function brDate(iso?: string | null) {
  const [year, month, day] = String(iso ?? '').slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : '—'
}

function stateText(notice: LicenseNoticeData) {
  if (notice.state === 'overdue') {
    const days = Math.abs(notice.days_left ?? 0)
    return `Sua assinatura venceu há ${days} dia${days === 1 ? '' : 's'}. Regularize para não perder o acesso.`
  }
  if (notice.state === 'due_today') return 'Sua assinatura vence hoje.'
  const days = notice.days_left ?? 0
  return `Sua assinatura vence em ${days} dia${days === 1 ? '' : 's'}.`
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // sem permissão de área de transferência
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg bg-[var(--page)] px-3 py-2 text-[12.5px] font-bold text-[var(--blue-700)] hover:bg-[var(--blue-100)]"
    >
      <CopyIcon className="h-3.5 w-3.5" />
      {copied ? 'Copiado!' : label}
    </button>
  )
}

// Faixa de aviso no topo do PDV e, uma vez por sessão, a janela com as formas de pagar.
export function LicenseNotice({ session, company }: LicenseNoticeProps) {
  const token = session.token.token
  const [notice, setNotice] = useState<LicenseNoticeData | null>(null)
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState<string | null>(null)

  const load = useCallback(() => {
    if (company.is_master) return
    fetchLicenseNotice(token, company.id)
      .then((res) => {
        setNotice(res.show ? res : null)
        if (!res.show) return
        const key = `c2_pdv_license_notice_${company.id}_${res.due_date}`
        try {
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1')
            setOpen(true)
          }
        } catch {
          setOpen(true)
        }
      })
      .catch(() => setNotice(null))
  }, [token, company.id, company.is_master])

  useEffect(() => {
    load()
    const interval = setInterval(load, REFRESH_MS)
    window.addEventListener('focus', load)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', load)
    }
  }, [load])

  const pix = notice?.boleto?.pix_copy_paste ?? null
  useEffect(() => {
    if (!pix) {
      setQr(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(pix, { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setQr(url)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [pix])

  if (!notice) return null

  const urgent = notice.state !== 'due_soon'
  const boleto = notice.boleto

  return (
    <>
      <div
        className={`flex flex-none flex-wrap items-center justify-between gap-3 px-4 py-2 text-[13px] font-semibold print-hide ${
          urgent ? 'bg-[var(--red-500)] text-white' : 'bg-[var(--amber-100)] text-[var(--amber-500)]'
        }`}
      >
        <span className="flex items-center gap-2">
          <AlertTriangleIcon className="h-4 w-4 flex-none" />
          {stateText(notice)}
          {notice.amount !== null && <span className="font-normal"> Valor: {formatCurrency(notice.amount)}.</span>}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold ${
            urgent ? 'bg-white text-[var(--red-500)] hover:bg-white/90' : 'bg-[var(--amber-500)] text-white hover:opacity-90'
          }`}
        >
          {boleto ? 'Ver boleto e pagar' : 'Ver detalhes'}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 print-hide" onClick={() => setOpen(false)}>
          <div
            className="max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-[var(--surface)] p-6 shadow-[var(--card-shadow)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[17px] font-bold text-[var(--ink)]">Pagamento da assinatura</h2>
                <p className={`mt-0.5 text-[13px] font-semibold ${urgent ? 'text-[var(--red-500)]' : 'text-[var(--amber-500)]'}`}>
                  {stateText(notice)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--page)] hover:text-[var(--ink)]"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--page)] p-4">
              <div>
                <p className="text-[11px] font-bold tracking-wide text-[var(--muted)] uppercase">Valor</p>
                <p className="text-[18px] font-bold text-[var(--ink)]">{notice.amount !== null ? formatCurrency(notice.amount) : '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold tracking-wide text-[var(--muted)] uppercase">Vencimento</p>
                <p className="text-[18px] font-bold text-[var(--ink)]">{brDate(notice.due_date)}</p>
              </div>
            </div>

            {boleto ? (
              <div className="mt-4 flex flex-col gap-4">
                {pix && (
                  <div className="rounded-xl border border-[var(--border)] p-4">
                    <p className="text-[13.5px] font-bold text-[var(--ink)]">Pagar com PIX</p>
                    <p className="text-[12px] text-[var(--muted)]">Abra o app do seu banco, escolha PIX e leia o QR Code ou use o copia e cola.</p>
                    {qr && <img src={qr} alt="QR Code do PIX" className="mx-auto my-3 h-44 w-44 rounded-lg bg-white p-1.5" />}
                    <div className="flex justify-center">
                      <CopyButton value={pix} label="Copiar PIX copia e cola" />
                    </div>
                  </div>
                )}

                {(boleto.pdf_url || boleto.digitable_line) && (
                  <div className="rounded-xl border border-[var(--border)] p-4">
                    <p className="text-[13.5px] font-bold text-[var(--ink)]">Pagar com boleto</p>
                    {boleto.digitable_line && (
                      <p className="mt-1 break-all rounded-lg bg-[var(--page)] px-3 py-2 font-mono text-[12.5px] text-[var(--ink)]">
                        {boleto.digitable_line}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {boleto.digitable_line && <CopyButton value={boleto.digitable_line} label="Copiar linha digitável" />}
                      {boleto.pdf_url && (
                        <a
                          href={boleto.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded-lg bg-[var(--blue-500)] px-3 py-2 text-[12.5px] font-bold text-white hover:bg-[var(--blue-700)]"
                        >
                          <FileTextIcon className="h-3.5 w-3.5" />
                          Baixar boleto (PDF)
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-[var(--page)] px-4 py-3 text-[13px] text-[var(--ink-soft)]">
                O boleto ainda não está disponível aqui. Fale com o suporte do Controle Dois para receber a forma de pagamento.
              </p>
            )}

            <p className="mt-4 text-[11.5px] text-[var(--muted)]">Depois do pagamento, o aviso some assim que o Controle Dois confirmar o recebimento.</p>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-[var(--page)] px-5 py-2.5 text-[13.5px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
