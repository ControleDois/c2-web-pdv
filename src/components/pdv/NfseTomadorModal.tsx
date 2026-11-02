import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { lookupCep } from '../../lib/cep'
import { formatDocument } from '../../lib/formatDocument'
import type { NfseTomador } from '../../lib/nfce'

interface NfseTomadorModalProps {
  initial: NfseTomador
  missing: string[]
  onSkip: () => void
  onSubmit: (tomador: NfseTomador) => void
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function formatCep(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

const inputClass =
  'w-full rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)] disabled:opacity-60'

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">{label}</span>
      {children}
    </label>
  )
}

// Dados do tomador exigidos pela NFS-e (documento, e-mail e endereço com município IBGE).
// Aparece quando a venda não tem cliente, só tem o CPF na nota ou o cadastro está incompleto.
export function NfseTomadorModal({ initial, missing, onSkip, onSubmit }: NfseTomadorModalProps) {
  const [name, setName] = useState(initial.name)
  const [document, setDocument] = useState(formatDocument(initial.document))
  const [email, setEmail] = useState(initial.email)
  const [phone, setPhone] = useState(formatPhone(initial.phone))
  const [zipCode, setZipCode] = useState(formatCep(initial.address.zip_code))
  const [address, setAddress] = useState(initial.address.address)
  const [number, setNumber] = useState(initial.address.number)
  const [complement, setComplement] = useState(initial.address.complement)
  const [district, setDistrict] = useState(initial.address.district)
  const [city, setCity] = useState(initial.address.city)
  const [state, setState] = useState(initial.address.state)
  const [codeIbge, setCodeIbge] = useState(initial.address.code_ibge)
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function fillFromCep(raw: string, keepFilled: boolean) {
    if (raw.replace(/\D/g, '').length !== 8) return
    setCepLoading(true)
    setCepError(null)
    const found = await lookupCep(raw)
    setCepLoading(false)
    if (!found) {
      setCepError('CEP não encontrado. Confira o número ou preencha cidade e UF.')
      return
    }
    if (!keepFilled || !address) setAddress(found.address)
    if (!keepFilled || !district) setDistrict(found.district)
    setCity(found.city)
    setState(found.state)
    setCodeIbge(found.code_ibge)
  }

  // Cadastro antigo com CEP mas sem o código IBGE: busca de novo sem apagar o que já tem.
  useEffect(() => {
    if (initial.address.zip_code && !initial.address.code_ibge) void fillFromCep(initial.address.zip_code, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const digits = document.replace(/\D/g, '')
    const problems: string[] = []
    if (!name.trim()) problems.push('nome')
    if (digits.length !== 11 && digits.length !== 14) problems.push('CPF/CNPJ')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) problems.push('e-mail')
    if (zipCode.replace(/\D/g, '').length !== 8) problems.push('CEP')
    if (!address.trim()) problems.push('endereço')
    if (!number.trim()) problems.push('número')
    if (!district.trim()) problems.push('bairro')
    if (!city.trim() || state.trim().length !== 2) problems.push('cidade/UF')
    if (problems.length) {
      setError(`Preencha: ${problems.join(', ')}.`)
      return
    }
    onSubmit({
      people_id: initial.people_id,
      name: name.trim(),
      document: digits,
      email: email.trim(),
      phone: phone.replace(/\D/g, ''),
      address: {
        zip_code: zipCode.replace(/\D/g, ''),
        address: address.trim(),
        number: number.trim(),
        complement: complement.trim(),
        district: district.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        // Cidade digitada à mão sem CEP válido: o backend resolve o código pelo nome e UF.
        code_ibge: codeIbge,
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 pt-4 sm:pt-12">
      <form
        onSubmit={handleSubmit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onSkip()
          }
        }}
        className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl bg-[var(--surface)] p-5 shadow-xl"
      >
        <div>
          <p className="text-[15px] font-bold text-[var(--ink)]">Dados do cliente para a NFS-e</p>
          <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">
            A nota de serviço exige CPF/CNPJ, e-mail e endereço completo do cliente.
            {missing.length > 0 && <> Falta: <span className="font-semibold text-[var(--red-500)]">{missing.join(', ')}</span>.</>}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-6">
          <Field label="Nome / Razão social" className="sm:col-span-4">
            <input autoFocus={!name} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="CPF ou CNPJ" className="sm:col-span-2">
            <input
              inputMode="numeric"
              autoFocus={!!name && !document}
              value={document}
              onChange={(e) => setDocument(formatDocument(e.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="E-mail" className="sm:col-span-4">
            <input
              type="email"
              autoFocus={!!name && !!document && !email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Telefone (opcional)" className="sm:col-span-2">
            <input inputMode="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className={inputClass} />
          </Field>
          <Field label={cepLoading ? 'CEP (buscando…)' : 'CEP'} className="sm:col-span-2">
            <input
              inputMode="numeric"
              value={zipCode}
              onChange={(e) => {
                const value = formatCep(e.target.value)
                setZipCode(value)
                setCodeIbge('')
                if (value.replace(/\D/g, '').length === 8) void fillFromCep(value, false)
              }}
              className={inputClass}
            />
          </Field>
          <Field label="Endereço" className="sm:col-span-4">
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Número" className="sm:col-span-2">
            <input value={number} onChange={(e) => setNumber(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Complemento (opcional)" className="sm:col-span-4">
            <input value={complement} onChange={(e) => setComplement(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Bairro" className="sm:col-span-2">
            <input value={district} onChange={(e) => setDistrict(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Cidade" className="sm:col-span-3">
            <input
              value={city}
              onChange={(e) => {
                setCity(e.target.value)
                setCodeIbge('')
              }}
              className={inputClass}
            />
          </Field>
          <Field label="UF" className="sm:col-span-1">
            <input
              maxLength={2}
              value={state}
              onChange={(e) => {
                setState(e.target.value.toUpperCase())
                setCodeIbge('')
              }}
              className={inputClass}
            />
          </Field>
        </div>

        {cepError && <p className="text-[12.5px] font-medium text-[var(--amber-500)]">{cepError}</p>}
        {error && <p className="text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]"
          >
            Seguir sem NFS-e (Esc)
          </button>
          <button
            type="submit"
            disabled={cepLoading}
            className="rounded-xl bg-[var(--blue-500)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--blue-700)] disabled:opacity-60"
          >
            Salvar e emitir NFS-e
          </button>
        </div>
      </form>
    </div>
  )
}
