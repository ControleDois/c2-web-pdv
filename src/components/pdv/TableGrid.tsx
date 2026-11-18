import { useEffect, useState } from 'react'
import type { FoodTable } from '../../lib/foodTypes'
import { isDeliveryTable, isIfoodOrder, activeItems } from '../../lib/foodTypes'
import { formatCurrency } from '../../lib/format'
import { TableIcon, TruckIcon, BagIcon, SettingsIcon, CoinIcon, ClockIcon } from '../icons'

interface TableGridProps {
  tables: FoodTable[]
  search: string
  onSearchChange: (value: string) => void
  onSubmit: () => void
  onSelect: (table: FoodTable) => void
  onOpenSettings: () => void
  onOpenQuickSale?: () => void
  idleAlertMinutes: number
  // Mesas com pedido novo ainda não visto pelo caixa
  alertTableIds?: string[]
  onNewDelivery?: () => void
}

type Filter = 'all' | 'tables' | 'delivery' | 'bill' | 'idle'

const BILL_REQUESTED = 'CONTA SOLICITADA'

function tableTotal(table: FoodTable) {
  const items = activeItems(table).reduce((sum, item) => sum + item.sub_total, 0)
  const received = table.partials.reduce((sum, partial) => sum + partial.received, 0)
  return Math.max(0, items + (table.delivery_order?.delivery_fee ?? table.delivery_fee ?? 0) - received)
}

// Pediu a conta (garçom) e não lançou nada depois.
function billRequested(table: FoodTable) {
  const last = [...table.audit].reverse().find((entry) => entry.description === BILL_REQUESTED || (entry.description || '').startsWith('LANÇOU'))
  return last?.description === BILL_REQUESTED
}

function idleMinutes(table: FoodTable, limit: number, now: number): number | null {
  const items = activeItems(table)
  if (!limit || items.length === 0) return null
  const last = items.map((item) => item.createdAt ?? '').filter(Boolean).sort().pop() ?? table.opened_at
  const minutes = Math.floor((now - new Date(last).getTime()) / 60000)
  return Number.isFinite(minutes) && minutes >= limit ? minutes : null
}

function elapsed(iso: string | null | undefined, now: number) {
  if (!iso) return ''
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(minutes) || minutes < 0) return ''
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

export function TableGrid({ tables, search, onSearchChange, onSubmit, onSelect, onOpenSettings, onOpenQuickSale, idleAlertMinutes, alertTableIds = [], onNewDelivery }: TableGridProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const open = tables
    .filter((table) => table.status === 'open_empty' || table.status === 'open_with_items')
    .sort((a, b) => a.number - b.number)
  const counts = {
    all: open.length,
    tables: open.filter((table) => !isDeliveryTable(table)).length,
    delivery: open.filter((table) => isDeliveryTable(table)).length,
    bill: open.filter(billRequested).length,
    idle: open.filter((table) => idleMinutes(table, idleAlertMinutes, now) !== null).length,
  }
  const visible = open.filter((table) => {
    if (filter === 'tables') return !isDeliveryTable(table)
    if (filter === 'delivery') return isDeliveryTable(table)
    if (filter === 'bill') return billRequested(table)
    if (filter === 'idle') return idleMinutes(table, idleAlertMinutes, now) !== null
    return true
  })
  const openTotal = open.reduce((sum, table) => sum + tableTotal(table), 0)

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'tables', label: 'Mesas' },
    { key: 'delivery', label: 'Delivery' },
    { key: 'bill', label: 'Pediram a conta' },
    { key: 'idle', label: 'Sem pedir há muito tempo' },
  ]

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-none flex-wrap items-center gap-3">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
          className="min-w-0 flex-1 sm:max-w-[360px]"
        >
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            value={search}
            onChange={(event) => onSearchChange(event.target.value.replace(/\D/g, ''))}
            placeholder="Nº da mesa + Enter para abrir"
            className="w-full rounded-2xl bg-[var(--surface)] px-5 py-3.5 text-center text-[22px] font-bold text-[var(--ink)] shadow-[var(--card-shadow)] placeholder:text-[15px] placeholder:font-medium placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-300)]"
          />
        </form>
        <div className="hidden flex-col sm:flex">
          <span className="text-[12px] font-semibold text-[var(--muted)]">
            {counts.all} {counts.all === 1 ? 'aberta' : 'abertas'}
          </span>
          <span className="text-[17px] font-bold text-[var(--ink)]">{formatCurrency(openTotal)}</span>
        </div>
        {onNewDelivery && (
          <button
            type="button"
            onClick={onNewDelivery}
            className="flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-[13.5px] font-bold text-white shadow-[var(--card-shadow)] hover:bg-violet-700"
          >
            <TruckIcon className="h-4 w-4" />
            Novo delivery
          </button>
        )}
        <div className="ml-auto flex gap-2 md:hidden">
          {onOpenQuickSale && (
            <button
              type="button"
              onClick={onOpenQuickSale}
              title="Venda Rápida"
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--ink-soft)] shadow-[var(--card-shadow)]"
            >
              <CoinIcon className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            title="Configurações"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--ink-soft)] shadow-[var(--card-shadow)]"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open.length > 0 && (
        <div className="-mx-4 flex flex-none gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&::-webkit-scrollbar]:hidden">
          {filters
            .filter((item) => item.key === 'all' || counts[item.key] > 0)
            .map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`flex flex-none items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition ${
                  filter === item.key
                    ? 'bg-[var(--blue-500)] text-white'
                    : 'bg-[var(--surface)] text-[var(--ink-soft)] shadow-[var(--card-shadow)] hover:text-[var(--ink)]'
                }`}
              >
                {item.label}
                <span className={`rounded-full px-1.5 text-[11px] ${filter === item.key ? 'bg-white/25' : 'bg-[var(--page)]'}`}>{counts[item.key]}</span>
              </button>
            ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--blue-700)] shadow-[var(--card-shadow)]">
            <TableIcon className="h-5 w-5" />
          </span>
          <p className="text-[14px] font-bold text-[var(--ink)]">{open.length === 0 ? 'Nenhuma mesa aberta' : 'Nada neste filtro'}</p>
          <p className="text-[12.5px] text-[var(--muted)]">Digite o número da mesa e tecle Enter para abrir.</p>
        </div>
      ) : (
        <div className="grid flex-1 content-start gap-3 overflow-y-auto pb-20 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] md:pb-2">
          {visible.map((table) => {
            const delivery = isDeliveryTable(table)
            const ifood = isIfoodOrder(table)
            const items = activeItems(table)
            const count = items.reduce((sum, item) => sum + item.quantity, 0)
            const bill = billRequested(table)
            const unsent = items.some((item) => item.print_hold)
            const time = elapsed(table.opened_at, now)
            const idle = idleMinutes(table, idleAlertMinutes, now)
            const fresh = alertTableIds.includes(table.id)

            let accent = 'bg-[var(--blue-500)]'
            let badge = 'bg-[var(--blue-100)] text-[var(--blue-700)]'
            let Icon = TableIcon
            let label = String(table.number)
            let caption = 'Mesa'
            if (ifood) {
              accent = 'bg-red-500'
              badge = 'bg-red-100 text-red-600'
              Icon = BagIcon
              caption = 'iFood'
              label = table.delivery_order?.external_display_id || String(table.number)
            } else if (delivery) {
              accent = 'bg-violet-500'
              badge = 'bg-violet-100 text-violet-700'
              Icon = TruckIcon
              caption = 'Delivery'
              if (table.kind === 'delivery' && table.number > 9000) label = String(table.number - 9000)
            }
            if (bill) accent = 'bg-[var(--amber-500)]'
            if (idle) accent = 'bg-[var(--red-500)]'
            if (fresh) accent = 'bg-[var(--red-500)]'
            if (items.length === 0) accent = 'bg-[var(--border)]'

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => onSelect(table)}
                className={`relative flex min-h-[124px] flex-col overflow-hidden rounded-2xl p-3.5 pt-4 text-left shadow-[var(--card-shadow)] transition hover:-translate-y-0.5 ${
                  fresh
                    ? 'table-new-order bg-[var(--red-100)] ring-2 ring-[var(--red-500)]'
                    : 'bg-[var(--surface)] ring-1 ring-transparent hover:ring-[var(--blue-300)]'
                }`}
              >
                {fresh && (
                  <span className="absolute top-2 right-2 z-10 rounded-full bg-[var(--red-500)] px-2 py-0.5 text-[10.5px] font-bold text-white">
                    🔔 PEDIDO NOVO
                  </span>
                )}
                <span className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold tracking-wide text-[var(--muted)] uppercase">{caption}</p>
                    <p className="truncate text-[26px] font-bold leading-tight text-[var(--ink)]">{label}</p>
                    {table.customer_name && (
                      <p className="truncate text-[13px] font-bold text-[var(--blue-700)]">{table.customer_name}</p>
                    )}
                  </div>
                  <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-xl ${badge}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-auto pt-2">
                  {items.length > 0 ? (
                    <p className="text-[15px] font-bold text-[var(--ink)]">{formatCurrency(tableTotal(table))}</p>
                  ) : (
                    <p className="text-[13px] font-semibold text-[var(--muted)]">Sem itens</p>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--muted)]">
                    {count > 0 && <span>{count} {count === 1 ? 'item' : 'itens'}</span>}
                    {time && (
                      <span className="flex items-center gap-0.5">
                        <ClockIcon className="h-3 w-3" />
                        {time} de casa
                      </span>
                    )}
                  </div>
                  {(bill || unsent || idle) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {idle && (
                        <span className="rounded-full bg-[var(--red-500)] px-2 py-0.5 text-[10.5px] font-bold text-white">
                          ⚠ {idle < 60 ? `${idle} min` : `${Math.floor(idle / 60)}h${String(idle % 60).padStart(2, '0')}`} sem pedir
                        </span>
                      )}
                      {bill && <span className="rounded-full bg-[var(--amber-100)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--amber-500)]">Pediu a conta</span>}
                      {unsent && <span className="rounded-full bg-[var(--green-100)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--green-600)]">Pedido não enviado</span>}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
