import type { FoodTable } from '../../lib/foodTypes'
import { isDeliveryTable, isIfoodOrder, activeItems } from '../../lib/foodTypes'
import { TableIcon, TruckIcon, BagIcon, SettingsIcon } from '../icons'

interface TableGridProps {
  tables: FoodTable[]
  search: string
  onSearchChange: (value: string) => void
  onSubmit: () => void
  onSelect: (table: FoodTable) => void
  onOpenSettings: () => void
}

function statusDotClass(table: FoodTable): string {
  if (table.status === 'open_with_items') return 'bg-emerald-500'
  return 'bg-amber-500'
}

export function TableGrid({ tables, search, onSearchChange, onSubmit, onSelect, onOpenSettings }: TableGridProps) {
  const visible = tables
    .filter((table) => table.status === 'open_empty' || table.status === 'open_with_items')
    .sort((a, b) => a.number - b.number)

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-none items-center gap-2">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
          className="min-w-0 flex-1"
        >
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            value={search}
            onChange={(event) => onSearchChange(event.target.value.replace(/\D/g, ''))}
            placeholder="Número da mesa"
            className="w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-center text-[22px] font-bold text-[var(--ink)] placeholder:text-[16px] placeholder:font-normal placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-300)]"
          />
        </form>
        <button
          type="button"
          onClick={onOpenSettings}
          title="Configurações"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--ink-soft)] transition hover:text-[var(--ink)] md:hidden"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center">
          <p className="text-[13px] text-[var(--muted)]">Digite o número da mesa</p>
        </div>
      ) : (
        <div className="grid flex-1 content-start gap-2.5 overflow-y-auto [grid-template-columns:repeat(auto-fill,minmax(84px,1fr))]">
          {visible.map((table) => {
            const delivery = isDeliveryTable(table)
            const ifood = isIfoodOrder(table)
            const count = activeItems(table).length

            let badgeClass = 'bg-[var(--blue-100)] text-[var(--blue-700)]'
            let Icon = TableIcon
            let label = `Mesa ${table.number}`
            if (ifood) {
              badgeClass = 'bg-red-100 text-red-600'
              Icon = BagIcon
              label = 'iFood'
            } else if (delivery) {
              badgeClass = 'bg-violet-100 text-violet-700'
              Icon = TruckIcon
              label = `Delivery ${table.number}`
            }

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => onSelect(table)}
                className="relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 transition hover:border-[var(--blue-300)]"
              >
                <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${statusDotClass(table)}`} />
                <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${badgeClass}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-center text-[11.5px] font-bold leading-tight text-[var(--ink)]">{label}</span>
                {count > 0 && <span className="text-[10px] text-[var(--muted)]">{count} item{count === 1 ? '' : 's'}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
