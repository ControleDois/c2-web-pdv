import { useEffect, useRef, useState } from 'react'
import { redeemSaleToken, type RedeemResult } from '../lib/saleTokens'
import { beep } from '../lib/beep'
import { ApiError } from '../lib/api'
import { CheckCircleIcon, AlertTriangleIcon, QrCodeIcon } from '../components/icons'
import type { AuthSession, AuthCompany } from '../lib/auth'

interface TokenRedeemPageProps {
  session: AuthSession
  company: AuthCompany
}

interface LogEntry {
  key: number
  code: string
  ok: boolean
  title: string
  detail: string
  at: Date
}

const time = (date: Date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// Troca de fichas: o campo fica sempre focado; o leitor de código de barras
// "digita" o código e dá Enter, e a ficha é baixada na hora. Verde = liberar o
// produto; vermelho = não entregar (já trocada, cancelada ou inexistente).
export function TokenRedeemPage({ session, company }: TokenRedeemPageProps) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<{ ok: boolean; title: string; detail: string } | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [redeemedCount, setRedeemedCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const counter = useRef(0)

  // Mantém o foco no campo (o operador não precisa clicar antes de bipar).
  useEffect(() => {
    inputRef.current?.focus()
    const refocus = () => inputRef.current?.focus()
    window.addEventListener('focus', refocus)
    return () => window.removeEventListener('focus', refocus)
  }, [])

  function describe(result: RedeemResult): { ok: boolean; title: string; detail: string } {
    const token = result.token
    if (result.ok && token) {
      return {
        ok: true,
        title: token.product_name,
        detail: `Venda${token.sale_code ? ` #${token.sale_code}` : ''} · ficha ${token.sequence}/${token.total}`,
      }
    }
    return {
      ok: false,
      title: result.message ?? 'Não foi possível trocar a ficha.',
      detail: token ? `${token.product_name} · venda${token.sale_code ? ` #${token.sale_code}` : ''} · ficha ${token.sequence}/${token.total}` : '',
    }
  }

  async function submit() {
    const value = code.trim()
    setCode('')
    if (!value || busy) {
      inputRef.current?.focus()
      return
    }
    setBusy(true)
    let entry: { ok: boolean; title: string; detail: string }
    try {
      entry = describe(await redeemSaleToken(session.token.token, company.id, value))
    } catch (err) {
      entry = { ok: false, title: err instanceof ApiError ? err.message : 'Sem conexão com o sistema. Tente de novo.', detail: '' }
    }

    beep(entry.ok ? 'ok' : 'error')
    setLast(entry)
    if (entry.ok) setRedeemedCount((count) => count + 1)
    counter.current += 1
    setLog((current) => [{ key: counter.current, code: value.toUpperCase(), at: new Date(), ...entry }, ...current].slice(0, 12))
    setBusy(false)
    inputRef.current?.focus()
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-[18px] font-bold text-[var(--ink)]">Troca de fichas</h1>
        <p className="text-[12.5px] text-[var(--ink-soft)]">
          Bipe o código de barras da ficha. Verde: entregue o produto. Vermelho: não entregue.
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <label className="flex items-center gap-3 rounded-2xl border-2 border-[var(--blue-300)] bg-[var(--surface)] px-4 py-3.5 focus-within:border-[var(--blue-500)]">
          <QrCodeIcon className="h-6 w-6 flex-none text-[var(--blue-700)]" />
          <input
            ref={inputRef}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="Bipe a ficha (ou digite o código e Enter)"
            className="min-w-0 flex-1 bg-transparent text-[20px] font-semibold tracking-wider text-[var(--ink)] uppercase placeholder:text-[15px] placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--muted)] focus:outline-none"
          />
          {busy && <span className="text-[12px] font-semibold text-[var(--muted)]">Conferindo…</span>}
        </label>

        {last ? (
          <div
            className={`flex items-center gap-4 rounded-2xl p-6 ${
              last.ok ? 'bg-[var(--green-100)] text-[var(--green-600)]' : 'bg-[var(--red-100)] text-[var(--red-500)]'
            }`}
          >
            {last.ok ? <CheckCircleIcon className="h-14 w-14 flex-none" /> : <AlertTriangleIcon className="h-14 w-14 flex-none" />}
            <div className="min-w-0">
              <p className="text-[12px] font-bold tracking-wide uppercase">{last.ok ? 'Troca liberada' : 'Não entregar'}</p>
              <p className="text-[26px] leading-tight font-bold break-words">{last.title}</p>
              {last.detail && <p className="mt-1 text-[13px] font-medium opacity-90">{last.detail}</p>}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-[13.5px] text-[var(--muted)]">
            Aguardando a primeira ficha.
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-bold text-[var(--ink)]">Últimas leituras</p>
            <p className="text-[12px] text-[var(--ink-soft)]">
              {redeemedCount} troca{redeemedCount === 1 ? '' : 's'} nesta tela
            </p>
          </div>
          {log.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-[var(--muted)]">Nenhuma leitura ainda.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {log.map((entry) => (
                <div key={entry.key} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className={`truncate text-[13px] font-bold ${entry.ok ? 'text-[var(--ink)]' : 'text-[var(--red-500)]'}`}>{entry.title}</p>
                    <p className="truncate text-[11.5px] text-[var(--muted)]">
                      <span className="font-mono">{entry.code}</span>
                      {entry.detail ? ` · ${entry.detail}` : ''}
                    </p>
                  </div>
                  <span className="flex-none text-[11.5px] text-[var(--muted)]">{time(entry.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
