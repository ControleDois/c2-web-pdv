import { useState, type FormEvent } from 'react'
import { createClient, type PersonRecord } from '../../lib/people'
import { formatDocument } from '../../lib/formatDocument'
import { ApiError } from '../../lib/api'

interface QuickClientCreateProps {
  token: string
  companyId: string
  initialName: string
  onCancel: () => void
  onCreated: (person: PersonRecord) => void
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

// Cadastro rápido de cliente dentro do modal de cliente da venda rápida:
// grava e já devolve o cadastro para entrar na venda.
export function QuickClientCreate({ token, companyId, initialName, onCancel, onCreated }: QuickClientCreateProps) {
  const [name, setName] = useState(initialName)
  const [document, setDocument] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const digits = document.replace(/\D/g, '')
    if (!name.trim()) {
      setError('Informe o nome.')
      return
    }
    if (digits.length !== 11 && digits.length !== 14) {
      setError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).')
      return
    }
    setSaving(true)
    setError(null)
    try {
      onCreated(await createClient(token, companyId, { name, document: digits, phone }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível cadastrar o cliente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onCancel()
        }
      }}
      className="flex flex-col gap-3 p-5"
    >
      <p className="text-[14.5px] font-bold text-[var(--ink)]">Cadastrar novo cliente</p>
      <label className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">Nome</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">CPF ou CNPJ</span>
          <input
            inputMode="numeric"
            value={document}
            onChange={(event) => setDocument(formatDocument(event.target.value))}
            className="rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">Telefone (opcional)</span>
          <input
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            className="rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]"
          />
        </label>
      </div>
      {error && <p className="text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]"
        >
          Voltar (Esc)
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[var(--blue-500)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--blue-700)] disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Cadastrar e usar'}
        </button>
      </div>
    </form>
  )
}
