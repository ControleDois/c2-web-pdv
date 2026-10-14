import { useRef, useState } from 'react'
import { createProduct } from '../../lib/products'
import { batchInsertProducts, filterProductBy, type LocalProduct } from '../../lib/db'
import { ApiError } from '../../lib/api'

interface QuickProductCreateProps {
  token: string
  companyId: string
  initialBarcode: string
  initialName: string
  // Dentro de uma venda o produto cadastrado já entra nela; fora, só fica cadastrado.
  inSale: boolean
  onClose: () => void
  onSaved: (product: LocalProduct) => void
}

function parseAmount(value: string): number {
  const number = Number(value.replace(/\./g, '').replace(',', '.'))
  return Number.isNaN(number) ? 0 : number
}

const inputClass =
  'rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[15px] font-semibold text-[var(--ink)] ring-1 ring-transparent focus:outline-none focus:ring-[var(--blue-300)]'

// Cadastro rápido de produto no PDV: bipa o código, digita nome e valor. Enter avança de campo e salva no último.
export function QuickProductCreate({ token, companyId, initialBarcode, initialName, inSale, onClose, onSaved }: QuickProductCreateProps) {
  const [barcode, setBarcode] = useState(initialBarcode)
  const [name, setName] = useState(initialName)
  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState<'UN' | 'KG'>('UN')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)

  async function leaveBarcode() {
    const code = barcode.trim()
    if (code) {
      const found = (await filterProductBy(code)).find(
        (product) => (product.barcode ?? '').toLowerCase() === code.toLowerCase() || String(product.code ?? '') === code
      )
      if (found) {
        setError(`Código já cadastrado: ${found.name}.`)
        return
      }
    }
    setError(null)
    nameRef.current?.focus()
  }

  async function save() {
    const cleanName = name.trim()
    const value = parseAmount(price)
    if (!cleanName) {
      setError('Informe o nome do produto.')
      nameRef.current?.focus()
      return
    }
    if (value <= 0) {
      setError('Informe o valor do produto.')
      priceRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await createProduct(token, {
        company_id: companyId,
        role: 0,
        name: cleanName,
        barcode: barcode.trim() || undefined,
        sale_value: value,
        unit,
      })
      const local: LocalProduct = {
        id: created.id,
        code: created.internal_code ?? created.code,
        barcode: created.barcode ?? (barcode.trim() || null),
        name: created.name,
        sale_value: Number(created.sale_value ?? value),
        unit: created.unit ?? unit,
      }
      await batchInsertProducts([local])
      onSaved(local)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível cadastrar o produto.')
      setSaving(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent, next: 'barcode' | 'name' | 'price') {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (next === 'barcode') void leaveBarcode()
      else if (next === 'name') {
        if (!name.trim()) return setError('Informe o nome do produto.')
        setError(null)
        priceRef.current?.focus()
      } else void save()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <p className="text-[14.5px] font-bold text-[var(--ink)]">Cadastro rápido de produto</p>
        <p className="mt-0.5 text-[11.5px] text-[var(--ink-soft)]">
          Bipe o código, digite o nome e o valor. Enter avança e salva no último campo.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">Código de barras</span>
            <input
              autoFocus={!initialBarcode}
              inputMode="numeric"
              value={barcode}
              placeholder="Bipe o produto"
              onChange={(event) => {
                setBarcode(event.target.value.replace(/\D/g, ''))
                setError(null)
              }}
              onKeyDown={(event) => handleKeyDown(event, 'barcode')}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">Nome</span>
            <input
              ref={nameRef}
              autoFocus={Boolean(initialBarcode)}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => handleKeyDown(event, 'name')}
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">Valor (R$)</span>
              <input
                ref={priceRef}
                inputMode="decimal"
                value={price}
                placeholder="0,00"
                onChange={(event) => setPrice(event.target.value.replace(/[^\d,]/g, ''))}
                onKeyDown={(event) => handleKeyDown(event, 'price')}
                className={inputClass}
              />
            </label>
            <div className="flex gap-1.5 pb-0.5">
              {(['UN', 'KG'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  tabIndex={-1}
                  onClick={() => setUnit(option)}
                  className={`rounded-xl border px-3 py-2.5 text-[12.5px] font-bold transition ${
                    unit === option
                      ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
                      : 'border-[var(--border)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-soft)]"
          >
            Cancelar (Esc)
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl bg-[var(--blue-500)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--blue-700)] disabled:opacity-60"
          >
            {saving ? 'Salvando…' : inSale ? 'Cadastrar e vender' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
