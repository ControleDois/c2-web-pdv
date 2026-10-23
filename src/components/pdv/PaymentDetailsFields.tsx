import { Select } from '../form/Select'

export interface PaymentDetails {
  acquirer: string
  otherCnpj: string
  brand: string
  authorization: string
}

export const EMPTY_PAYMENT_DETAILS: PaymentDetails = { acquirer: '', otherCnpj: '', brand: '', authorization: '' }

// Operadoras de maquininha mais comuns, com o CNPJ que a NFC-e pede (só números).
const ACQUIRERS = [
  { value: '16501555000157', label: 'Stone' },
  { value: '01027058000191', label: 'Cielo' },
  { value: '01425787000104', label: 'Rede' },
  { value: '08718431000108', label: 'PagSeguro' },
  { value: '10440482000154', label: 'Getnet' },
  { value: '10573521000191', label: 'Mercado Pago' },
]

// Bandeiras (tabela da NFC-e).
const BRANDS = [
  { value: '01', label: 'Visa' },
  { value: '02', label: 'Mastercard' },
  { value: '06', label: 'Elo' },
  { value: '03', label: 'American Express' },
  { value: '07', label: 'Hipercard' },
  { value: '99', label: 'Outra' },
]

export function isElectronicPayment(formPayment: number): boolean {
  return formPayment === 1 || formPayment === 2 || formPayment === 10
}

// Dados que seguem para a nota: só o que foi preenchido.
export function paymentDetailsPayload(formPayment: number, details: PaymentDetails) {
  if (!isElectronicPayment(formPayment)) return {}
  const authorization = details.authorization.trim()
  if (formPayment === 10) return authorization ? { payment_authorization: authorization } : {}
  const cnpj = (details.acquirer === 'other' ? details.otherCnpj : details.acquirer).replace(/\D/g, '')
  return {
    ...(details.brand ? { card_brand: details.brand } : {}),
    ...(authorization ? { payment_authorization: authorization } : {}),
    ...(cnpj.length === 14 ? { card_acquirer_cnpj: cnpj } : {}),
  }
}

interface PaymentDetailsFieldsProps {
  formPayment: number
  value: PaymentDetails
  onChange: (value: PaymentDetails) => void
  onEnter?: () => void
}

// Maquininha sem TEF: o operador digita os dados do comprovante e eles seguem na NFC-e.
export function PaymentDetailsFields({ formPayment, value, onChange, onEnter }: PaymentDetailsFieldsProps) {
  if (!isElectronicPayment(formPayment)) return null
  const set = (patch: Partial<PaymentDetails>) => onChange({ ...value, ...patch })
  const onKeyDown = (event: React.KeyboardEvent) => {
    // Esc e as teclas F (F4 confirma a venda) continuam valendo; o resto fica só no campo.
    if (event.key !== 'Escape' && !/^F\d+$/.test(event.key)) event.stopPropagation()
    if (event.key === 'Enter' && onEnter) {
      event.preventDefault()
      onEnter()
    }
  }
  const inputClass =
    'w-full rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--blue-300)]'

  if (formPayment === 10) {
    return (
      <div className="mt-3 rounded-xl border border-[var(--border)] p-3">
        <p className="text-[12px] font-bold text-[var(--ink)]">Dados do PIX (opcional)</p>
        <label className="mt-2 flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">ID da transação (E2E) do comprovante</span>
          <input
            value={value.authorization}
            onChange={(event) => set({ authorization: event.target.value })}
            onKeyDown={onKeyDown}
            placeholder="E00000000202610231200..."
            className={inputClass}
          />
        </label>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] p-3">
      <p className="text-[12px] font-bold text-[var(--ink)]">Dados do cartão (opcional, da maquininha)</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">Operadora</span>
          <Select value={value.acquirer} onChange={(acquirer) => set({ acquirer })} placeholder="Selecione">
            <option value="">Selecione…</option>
            {ACQUIRERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
            <option value="other">Outra (informar CNPJ)</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">Bandeira</span>
          <Select value={value.brand} onChange={(brand) => set({ brand })} placeholder="Selecione">
            <option value="">Selecione…</option>
            {BRANDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {value.acquirer === 'other' && (
        <label className="mt-2 flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">CNPJ da operadora</span>
          <input
            value={value.otherCnpj}
            onChange={(event) => set({ otherCnpj: event.target.value.replace(/\D/g, '').slice(0, 14) })}
            onKeyDown={onKeyDown}
            inputMode="numeric"
            placeholder="Só números"
            className={inputClass}
          />
        </label>
      )}
      <label className="mt-2 flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold text-[var(--ink-soft)]">Nº de autorização (NSU)</span>
        <input
          value={value.authorization}
          onChange={(event) => set({ authorization: event.target.value })}
          onKeyDown={onKeyDown}
          placeholder="Código do comprovante"
          className={inputClass}
        />
      </label>
    </div>
  )
}
