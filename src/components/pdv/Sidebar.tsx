import { GridIcon, SettingsIcon } from '../icons'

interface SidebarProps {
  screen: 'tables' | 'settings'
  onNavigate: (screen: 'tables' | 'settings') => void
}

// Só aparece em telas largas (desktop) - no celular/tablet estreito a
// navegação fica no botão de engrenagem dentro do próprio TableGrid.
export function Sidebar({ screen, onNavigate }: SidebarProps) {
  return (
    <nav className="hidden w-16 flex-none flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--surface)] py-4 md:flex">
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
