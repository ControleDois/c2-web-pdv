import { useEffect, useMemo, useRef, useState } from 'react'
import { formatCurrency } from '../../lib/format'
import { describeChoices, validateChoices, type ChosenOption, type MenuProduct } from '../../lib/foodMenu'
import { CloseIcon, MinusIcon, PlusIcon } from '../icons'

export interface ItemChoice {
  quantity: number
  unitPrice: number
  observation: string
}

interface Props {
  product: MenuProduct
  onClose: () => void
  onConfirm: (choice: ItemChoice) => void
}

// Lançar item na mesa: quantidade, adicionais (com preço) e observação para a cozinha.
export function ItemOptionsModal({ product, onClose, onConfirm }: Props) {
  const [quantity, setQuantity] = useState(1)
  const [chosen, setChosen] = useState<ChosenOption[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  const extras = useMemo(() => chosen.reduce((sum, choice) => sum + choice.option.sale_value * choice.quantity, 0), [chosen])
  const unitPrice = Number(product.sale_value || 0) + extras

  function qtyOf(complementId: string, optionId: string) {
    return chosen.find((choice) => choice.complementId === complementId && choice.option.id === optionId)?.quantity ?? 0
  }

  function setOption(complementId: string, optionId: string, next: number, single: boolean) {
    const group = product.complements.find((item) => item.id === complementId)
    const option = group?.options.find((item) => item.id === optionId)
    if (!group || !option) return
    setError(null)
    const previous = qtyOf(complementId, optionId)
    let list = chosen.filter((choice) => !(choice.complementId === complementId && choice.option.id === optionId))
    if (single) list = list.filter((choice) => choice.complementId !== complementId)
    if (next > 0) list.push({ complementId, option, quantity: next })
    setChosen(list)
    // Chegou no limite do grupo: rola sozinho para o próximo (ou para a observação).
    const total = list.filter((choice) => choice.complementId === complementId).reduce((sum, choice) => sum + choice.quantity, 0)
    if (next > previous && group.maximum > 0 && total >= group.maximum) {
      const following = product.complements[product.complements.findIndex((item) => item.id === complementId) + 1]
      const element = document.getElementById(following ? `pdv-grupo-${following.id}` : 'pdv-grupo-observacao')
      if (element) setTimeout(() => element.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
    }
  }

  function confirm() {
    const problem = validateChoices(product, chosen)
    if (problem) {
      setError(problem)
      return
    }
    onConfirm({ quantity, unitPrice, observation: describeChoices(product, chosen, note) })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        } else if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) {
          event.preventDefault()
          confirm()
        }
      }}
    >
      <div
        className="flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-3xl bg-[var(--surface)] shadow-2xl sm:max-w-[520px] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          {product.image_url && <img src={product.image_url} alt="" className="h-20 w-20 flex-none rounded-xl object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold leading-snug text-[var(--ink)]">{product.name}</p>
            {product.description && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-[var(--muted)]">{product.description}</p>}
            <p className="mt-1 text-[14px] font-bold text-[var(--blue-700)]">{formatCurrency(Number(product.sale_value || 0))}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--page)]">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {product.complements.map((group) => {
            const single = group.maximum === 1
            const picked = chosen.filter((choice) => choice.complementId === group.id).reduce((sum, choice) => sum + choice.quantity, 0)
            const minimum = group.required ? Math.max(group.minimum, 1) : group.minimum
            const rule = [
              minimum > 0 ? 'Obrigatório' : 'Opcional',
              group.maximum > 1 ? `até ${group.maximum}` : single ? 'escolha 1' : '',
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <section key={group.id} id={`pdv-grupo-${group.id}`} className="mb-4 scroll-mt-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[13.5px] font-bold text-[var(--ink)]">{group.name}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      minimum > 0 && picked < minimum ? 'bg-[var(--amber-100)] text-[var(--amber-500)]' : 'bg-[var(--page)] text-[var(--muted)]'
                    }`}
                  >
                    {rule}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {group.options.map((option) => {
                    const count = qtyOf(group.id, option.id)
                    const active = count > 0
                    return (
                      <div
                        key={option.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition ${
                          active ? 'border-[var(--blue-500)] bg-[var(--blue-100)]' : 'border-[var(--border)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setOption(group.id, option.id, single ? (active && minimum === 0 ? 0 : 1) : active ? 0 : 1, single)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          <span
                            className={`flex h-5 w-5 flex-none items-center justify-center border-2 ${single ? 'rounded-full' : 'rounded-md'} ${
                              active ? 'border-[var(--blue-500)] bg-[var(--blue-500)]' : 'border-[var(--border)]'
                            }`}
                          >
                            {active && <span className={`h-2 w-2 bg-white ${single ? 'rounded-full' : 'rounded-sm'}`} />}
                          </span>
                          <span className="truncate text-[13.5px] font-semibold text-[var(--ink)]">{option.description}</span>
                        </button>
                        <div className="flex flex-none items-center gap-2">
                          {option.sale_value > 0 && (
                            <span className="text-[12.5px] font-semibold text-[var(--ink-soft)]">+ {formatCurrency(option.sale_value)}</span>
                          )}
                          {!single && active && option.sale_value > 0 && (
                            <Stepper value={count} onChange={(value) => setOption(group.id, option.id, value, false)} small />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}

          <label id="pdv-grupo-observacao" className="flex scroll-mt-2 flex-col gap-1.5">
            <span className="text-[13.5px] font-bold text-[var(--ink)]">Observação</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Ex.: sem cebola, molho à parte"
              className="rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[13.5px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-300)]"
            />
          </label>
        </div>

        {error && <p className="mx-5 mb-2 rounded-xl bg-[var(--red-100)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--red-500)]">{error}</p>}

        <div className="flex items-center gap-3 border-t border-[var(--border)] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <Stepper value={quantity} onChange={(value) => setQuantity(Math.max(1, value))} />
          <button
            ref={confirmRef}
            type="button"
            onClick={confirm}
            className="flex flex-1 items-center justify-between rounded-xl bg-[var(--blue-500)] px-4 py-3 text-[14px] font-bold text-white transition hover:bg-[var(--blue-700)]"
          >
            <span>Adicionar</span>
            <span>{formatCurrency(unitPrice * quantity)}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export function Stepper({ value, onChange, small = false }: { value: number; onChange: (value: number) => void; small?: boolean }) {
  const size = small ? 'h-7 w-7' : 'h-10 w-10'
  return (
    <div className="flex flex-none items-center gap-1 rounded-xl bg-[var(--page)] p-1">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        aria-label="Diminuir"
        className={`flex ${size} items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--surface)]`}
      >
        <MinusIcon className="h-3.5 w-3.5" />
      </button>
      <span className={`min-w-[1.75rem] text-center font-bold text-[var(--ink)] ${small ? 'text-[12.5px]' : 'text-[15px]'}`}>{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Aumentar"
        className={`flex ${size} items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--surface)]`}
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
