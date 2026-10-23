import { useEffect, useState } from 'react'
import { ApiError } from '../../lib/api'
import { fetchCompanyWhatsapps, formatPhone, sendNfceWhatsapp, type CompanyWhatsapp } from '../../lib/whatsapp'
import { TextField } from '../form/TextField'
import { CloseIcon, WhatsappIcon } from '../icons'

interface NfceWhatsappModalProps {
  token: string
  companyId: string
  nfeId: string
  numero?: number | null
  defaultName?: string
  defaultPhone?: string
  onClose: () => void
  onSent: (message: string) => void
}

const STORAGE_KEY = 'c2_pdv_nfce_whatsapp'

// Manda o PDF da NFC-e autorizada para o WhatsApp do cliente: digita (ou confirma) o número e envia.
// Lembra qual WhatsApp da loja foi usado por último para ser só "digitar o número e Enter".
export function NfceWhatsappModal({ token, companyId, nfeId, numero, defaultName, defaultPhone, onClose, onSent }: NfceWhatsappModalProps) {
  const [whatsapps, setWhatsapps] = useState<CompanyWhatsapp[]>([])
  const [whatsappId, setWhatsappId] = useState('')
  const [phone, setPhone] = useState(String(defaultPhone ?? '').replace(/\D/g, '').slice(0, 11))
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCompanyWhatsapps(token, companyId)
      .then((list) => {
        if (cancelled) return
        setWhatsapps(list)
        let saved = ''
        try {
          saved = localStorage.getItem(`${STORAGE_KEY}_${companyId}`) ?? ''
        } catch {
          saved = ''
        }
        setWhatsappId(list.some((item) => item.id === saved) ? saved : list.length === 1 ? list[0].id : '')
      })
      .catch(() => !cancelled && setWhatsapps([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [token, companyId])

  async function handleSend() {
    if (sending) return
    if (!whatsappId) {
      setError('Escolha o WhatsApp da loja que vai enviar.')
      return
    }
    if (phone.length < 10) {
      setError('Digite o WhatsApp do cliente com DDD.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const result = await sendNfceWhatsapp(token, nfeId, { whatsappId, phone, name: defaultName })
      try {
        localStorage.setItem(`${STORAGE_KEY}_${companyId}`, whatsappId)
      } catch {
        // só uma conveniência
      }
      onSent(result.message)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar a NFC-e.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={sending ? undefined : onClose}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape' && !sending) {
          event.preventDefault()
          onClose()
        } else if (event.key === 'Enter') {
          event.preventDefault()
          void handleSend()
        }
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[14px] font-bold text-[var(--ink)]">
              <WhatsappIcon className="h-4 w-4 text-[var(--green-600)]" /> Enviar NFC-e{numero ? ` nº ${numero}` : ''}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-soft)]">O cliente recebe o PDF da nota no WhatsApp.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Fechar"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--page)]"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3.5">
          <TextField
            label={defaultName ? `WhatsApp de ${defaultName}` : 'WhatsApp do cliente'}
            icon={<WhatsappIcon className="h-4 w-4" />}
            placeholder="(66) 99999-9999"
            inputMode="tel"
            value={formatPhone(phone)}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 11))}
            autoFocus
          />

          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-[var(--ink-soft)]">Enviar por qual WhatsApp da loja?</p>
            {loading ? (
              <div className="h-10 animate-pulse rounded-xl bg-[var(--page)]" />
            ) : whatsapps.length === 0 ? (
              <p className="rounded-xl bg-[var(--amber-100)] px-3.5 py-2.5 text-[12px] text-[var(--ink)]">
                Nenhum WhatsApp conectado. Conecte um no painel, em Configurações → WhatsApp.
              </p>
            ) : (
              <select
                value={whatsappId}
                onChange={(event) => setWhatsappId(event.target.value)}
                className="w-full rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] focus:outline-none"
              >
                <option value="">Selecione</option>
                {whatsapps.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {item.phone}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink-soft)]"
          >
            Cancelar (Esc)
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || whatsapps.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--green-600)] py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            <WhatsappIcon className="h-4 w-4" />
            {sending ? 'Enviando…' : 'Enviar (Enter)'}
          </button>
        </div>
      </div>
    </div>
  )
}
