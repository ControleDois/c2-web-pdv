import { useState } from 'react'
import { CloseIcon } from '../icons'

export interface TableInfo {
  customer_name: string
  customer_phone: string
  delivery_address: string
  delivery_fee: number
}

interface Props {
  // Delivery mostra telefone, endereço e taxa; mesa só o nome do cliente.
  delivery: boolean
  title: string
  initial?: Partial<TableInfo>
  confirmLabel?: string
  onClose: () => void
  onConfirm: (info: TableInfo) => void
}

const parseMoney = (value: string) => {
  const number = Number(value.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0
}

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`
}

export function TableInfoModal({ delivery, title, initial, confirmLabel = 'Salvar', onClose, onConfirm }: Props) {
  const [name, setName] = useState(initial?.customer_name ?? '')
  const [phone, setPhone] = useState(formatPhone(initial?.customer_phone ?? ''))
  const [address, setAddress] = useState(initial?.delivery_address ?? '')
  const [fee, setFee] = useState(initial?.delivery_fee ? initial.delivery_fee.toFixed(2).replace('.', ',') : '')
  const [error, setError] = useState<string | null>(null)

  function confirm() {
    if (delivery && !name.trim()) {
      setError('Informe o nome do cliente.')
      return
    }
    if (delivery && !address.trim()) {
      setError('Informe o endereço de entrega.')
      return
    }
    onConfirm({
      customer_name: name.trim(),
      customer_phone: phone.replace(/\D/g, ''),
      delivery_address: address.trim(),
      delivery_fee: delivery ? parseMoney(fee) : 0,
    })
  }

  const field =
    'w-full rounded-xl border border-[var(--border)] bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-300)]'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <form
        className="w-full max-w-[440px] rounded-t-3xl bg-[var(--surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          confirm()
        }}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-[var(--ink)]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--page)]">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Nome do cliente</span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value.slice(0, 120))} placeholder="Ex.: João" className={field} />
          </label>
          {delivery && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Telefone</span>
                <input
                  value={phone}
                  inputMode="tel"
                  onChange={(event) => setPhone(formatPhone(event.target.value))}
                  placeholder="(65) 99999-9999"
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Endereço de entrega</span>
                <textarea
                  value={address}
                  rows={2}
                  onChange={(event) => setAddress(event.target.value.slice(0, 500))}
                  placeholder="Rua, número, bairro, referência"
                  className={`${field} resize-none`}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Taxa de entrega</span>
                <input
                  value={fee}
                  inputMode="decimal"
                  onChange={(event) => setFee(event.target.value.replace(/[^\d,]/g, ''))}
                  placeholder="0,00"
                  className={`${field} w-40`}
                />
              </label>
            </>
          )}
        </div>

        {error && <p className="mt-3 rounded-lg bg-[var(--red-100)] px-3 py-2 text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-[13.5px] font-semibold text-[var(--ink-soft)]">
            Voltar
          </button>
          <button type="submit" className="flex-1 rounded-xl bg-[var(--blue-500)] py-2.5 text-[13.5px] font-bold text-white hover:bg-[var(--blue-700)]">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
