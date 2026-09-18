import { GridIcon, SettingsIcon, CoinIcon } from '../icons'

export type PdvScreen = 'tables' | 'settings' | 'quick-sale'

interface SidebarProps {
  screen: PdvScreen
  onNavigate: (screen: PdvScreen) => void
  showTables?: boolean
  showQuickSale?: boolean
}

// Só aparece em telas largas (desktop) - no celular/tablet estreito a
// navegação fica no botão de engrenagem dentro do próprio TableGrid.
export function Sidebar({ screen, onNavigate, showTables = true, showQuickSale = false }: SidebarProps) {
  return (
    <nav className="hidden w-16 flex-none flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--surface)] py-4 md:flex">
      {showTables && (
        <button
          type="button"
          onClick={() => onNavigate('tables')}
          title="Mesas"
          className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[9.5px] font-bold transition ${
            screen === 'tables'
              ? 'bg-[var(--blue-100)] text-[var(--blue-700)]'
              : 'text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]'
          }`}
        >
          <GridIcon className="h-4 w-4" />
          Mesas
        </button>
      )}
      {showQuickSale && (
        <button
          type="button"
          onClick={() => onNavigate('quick-sale')}
          title="Venda Rápida"
          className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[9.5px] font-bold transition ${
            screen === 'quick-sale'
              ? 'bg-[var(--blue-100)] text-[var(--blue-700)]'
              : 'text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]'
          }`}
        >
          <CoinIcon className="h-4 w-4" />
          Venda
        </button>
      )}
      <button
        type="button"
        onClick={() => onNavigate('settings')}
        title="Configurações"
        className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[9.5px] font-bold transition ${
          screen === 'settings'
            ? 'bg-[var(--blue-100)] text-[var(--blue-700)]'
            : 'text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]'
        }`}
      >
        <SettingsIcon className="h-4 w-4" />
        Ajustes
      </button>
    </nav>
  )
}
