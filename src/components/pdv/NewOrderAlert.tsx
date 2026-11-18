import { formatCurrency } from '../../lib/format'

export interface TableOrderAlert {
  tableId: string
  label: string
  items: { name: string; quantity: number }[]
  total: number
  at: number
}

interface Props {
  alerts: TableOrderAlert[]
  onOpen: (tableId: string) => void
  onDismiss: () => void
}

// Pedido novo vindo do garçom (ou do cardápio/iFood): faixa piscando no topo até o caixa ver.
export function NewOrderAlert({ alerts, onOpen, onDismiss }: Props) {
  if (alerts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[70] flex justify-center px-3">
      <div className="new-order-alert pointer-events-auto w-full max-w-[560px] overflow-hidden rounded-2xl bg-[var(--red-500)] text-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="flex items-center gap-2 text-[15px] font-bold">
            <span className="bell text-[20px]">🔔</span>
            {alerts.length === 1 ? 'Novo pedido chegou!' : `${alerts.length} mesas com pedido novo!`}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl bg-white/20 px-3 py-1.5 text-[12.5px] font-bold hover:bg-white/30"
          >
            Ciente
          </button>
        </div>
        <ul className="max-h-[50vh] divide-y divide-white/15 overflow-y-auto bg-black/10">
          {alerts.map((alert) => (
            <li key={alert.tableId} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold">
                  {alert.label} · {formatCurrency(alert.total)}
                </p>
                <p className="truncate text-[12.5px] text-white/85">
                  {alert.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpen(alert.tableId)}
                className="flex-none rounded-xl bg-white px-3.5 py-2 text-[13px] font-bold text-[var(--red-500)] hover:bg-white/90"
              >
                Abrir mesa
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
