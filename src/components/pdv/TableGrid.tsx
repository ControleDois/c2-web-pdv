import type { FoodTable } from '../../lib/foodTypes'
import { isDeliveryTable, activeItems } from '../../lib/foodTypes'

interface TableGridProps {
  tables: FoodTable[]
  search: string
  onSearchChange: (value: string) => void
  onSubmit: () => void
  onSelect: (table: FoodTable) => void
}

function statusDotClass(table: FoodTable): string {
  if (table.status === 'open_with_items') return 'bg-emerald-500'
  return 'bg-amber-500'
}

export function TableGrid({ tables, search, onSearchChange, onSubmit, onSelect }: TableGridProps) {
  const visible = tables
    .filter((table) => table.status === 'open_empty' || table.status === 'open_with_items')
    .sort((a, b) => a.number - b.number)

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
        className="flex-none"
      >
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          value={search}
          onChange={(event) => onSearchChange(event.target.value.replace(/\D/g, ''))}
          placeholder="Número da mesa"
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-center text-[22px] font-bold text-[var(--ink)] placeholder:text-[16px] placeholder:font-normal placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-300)]"
        />
      </form>

      {visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center">
          <p className="text-[13px] text-[var(--muted)]">Digite o número da mesa</p>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-4 gap-2.5 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8">
          {visible.map((table) => {
            const delivery = isDeliveryTable(table)
            const count = activeItems(table).length
            return (
              <button
                key={table.id}
                type="button"
                onClick={() => onSelect(table)}
                className="relative flex flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-3 transition hover:border-[var(--blue-300)]"
              >
                <span className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full ${statusDotClass(table)}`} />
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-[15px] font-bold ${
                    delivery ? 'bg-violet-100 text-violet-700' : 'bg-[var(--blue-100)] text-[var(--blue-700)]'
                  }`}
                >
                  {delivery ? '🛵' : '▰'}
                </span>
                <span className="text-[13px] font-bold text-[var(--ink)]">
                  {delivery ? `Delivery ${table.number}` : `Mesa ${table.number}`}
                </span>
                {count > 0 && <span className="text-[11px] text-[var(--muted)]">{count} item{count === 1 ? '' : 's'}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
