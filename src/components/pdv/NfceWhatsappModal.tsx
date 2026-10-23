import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/api'
import { searchPeople, type PersonRecord } from '../../lib/people'
import { fetchCompanyWhatsapps, formatPhone, sendNfceWhatsapp, type CompanyWhatsapp } from '../../lib/whatsapp'
import { formatDocument } from '../../lib/formatDocument'
import { TextField } from '../form/TextField'
import { Select } from '../form/Select'
import { CloseIcon, SearchIcon, UserIcon, WhatsappIcon } from '../icons'

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

const personPhone = (person: PersonRecord) => String(person.phone ?? '').replace(/\D/g, '').slice(0, 11)

// Manda o PDF da NFC-e autorizada para o WhatsApp do cliente: escolhe um cliente cadastrado
// (o número vem do cadastro) OU digita o número direto. Lembra qual WhatsApp da loja foi usado
// por último, então o normal é só digitar o número e dar Enter.
export function NfceWhatsappModal({ token, companyId, nfeId, numero, defaultName, defaultPhone, onClose, onSent }: NfceWhatsappModalProps) {
  const [whatsapps, setWhatsapps] = useState<CompanyWhatsapp[]>([])
  const [whatsappId, setWhatsappId] = useState('')
  const [clientName, setClientName] = useState(defaultName ?? '')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PersonRecord[]>([])
  const [searching, setSearching] = useState(false)
  const [phone, setPhone] = useState(String(defaultPhone ?? '').replace(/\D/g, '').slice(0, 11))
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchSeq = useRef(0)

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

  // Busca de cliente (nome ou documento) com resposta fora de ordem descartada.
  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    const seq = ++searchSeq.current
    setSearching(true)
    const timer = window.setTimeout(() => {
      searchPeople(token, companyId, text)
        .then((list) => {
          if (seq === searchSeq.current) setResults(list)
        })
        .catch(() => {
          if (seq === searchSeq.current) setResults([])
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false)
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query, token, companyId])

  function chooseClient(person: PersonRecord) {
    setClientName(person.name)
    const registered = personPhone(person)
    if (registered) setPhone(registered)
    setQuery('')
    setResults([])
    setError(registered ? null : 'Este cliente não tem WhatsApp cadastrado. Digite o número abaixo.')
  }

  async function handleSend() {
    if (sending) return
    if (!whatsappId) {
      setError('Escolha o WhatsApp da loja que vai enviar.')
      return
    }
    if (phone.length < 10) {
      setError('Escolha um cliente ou digite o WhatsApp com DDD.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const result = await sendNfceWhatsapp(token, nfeId, { whatsappId, phone, name: clientName || undefined })
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
        } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
          event.preventDefault()
          void handleSend()
        }
      }}
    >
      <div
        className="max-h-[94vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[var(--surface)] p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[15px] font-bold text-[var(--ink)]">
              <WhatsappIcon className="h-4 w-4 text-[var(--green-600)]" /> Enviar NFC-e{numero ? ` nº ${numero}` : ''}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
              O cliente recebe o PDF da nota no WhatsApp. Escolha um cliente cadastrado ou digite o número direto.
            </p>
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

        <div className="mt-4 flex flex-col gap-4">
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-[var(--ink-soft)]">Cliente (opcional)</p>
            {clientName && !query ? (
              <div className="flex items-center gap-2 rounded-xl bg-[var(--blue-100)] px-3.5 py-2.5">
                <UserIcon className="h-4 w-4 flex-none text-[var(--blue-700)]" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--blue-700)]">{clientName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setClientName('')
                    setPhone('')
                  }}
                  className="flex-none text-[12px] font-bold text-[var(--blue-700)] hover:underline"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 rounded-xl bg-[var(--page)] px-3.5 py-2.5 ring-1 ring-transparent focus-within:ring-[var(--blue-300)]">
                  <SearchIcon className="h-4 w-4 flex-none text-[var(--muted)]" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar cliente por nome ou CPF"
                    className="min-w-0 w-full bg-transparent text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
                  />
                </div>
                {query.trim().length >= 2 && (
                  <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5">
                    {searching && results.length === 0 && <p className="px-3 py-2.5 text-[13px] text-[var(--muted)]">Buscando…</p>}
                    {!searching && results.length === 0 && (
                      <p className="px-3 py-2.5 text-[13px] text-[var(--muted)]">Nenhum cliente encontrado. Digite o número abaixo.</p>
                    )}
                    {results.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => chooseClient(person)}
                        className="flex min-h-[44px] w-full flex-col justify-center rounded-lg px-3 py-1.5 text-left hover:bg-[var(--blue-100)]"
                      >
                        <span className="text-[14px] font-semibold text-[var(--ink)]">{person.name}</span>
                        <span className="text-[12px] text-[var(--muted)]">
                          {[person.document ? formatDocument(person.document) : '', personPhone(person) ? formatPhone(personPhone(person)) : 'sem WhatsApp']
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <TextField
            label="WhatsApp do cliente"
            icon={<WhatsappIcon className="h-4 w-4" />}
            placeholder="(66) 99999-9999"
            inputMode="tel"
            value={formatPhone(phone)}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 11))}
            autoFocus={!defaultPhone}
          />

          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-[var(--ink-soft)]">Enviar por qual WhatsApp da loja?</p>
            {loading ? (
              <div className="h-11 animate-pulse rounded-xl bg-[var(--page)]" />
            ) : whatsapps.length === 0 ? (
              <p className="rounded-xl bg-[var(--amber-100)] px-3.5 py-2.5 text-[12.5px] text-[var(--ink)]">
                Nenhum WhatsApp conectado. Conecte um no painel, em Configurações → WhatsApp.
              </p>
            ) : (
              <Select value={whatsappId} onChange={setWhatsappId} placeholder="Selecione o WhatsApp">
                <option value="">Selecione</option>
                {whatsapps.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {formatPhone(item.phone)}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="flex-1 rounded-xl border border-[var(--border)] py-3 text-[13px] font-semibold text-[var(--ink-soft)]"
          >
            Cancelar (Esc)
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || whatsapps.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--green-600)] py-3 text-[13px] font-bold text-white disabled:opacity-50"
          >
            <WhatsappIcon className="h-4 w-4" />
            {sending ? 'Enviando…' : 'Enviar (Enter)'}
          </button>
        </div>
      </div>
    </div>
  )
}
