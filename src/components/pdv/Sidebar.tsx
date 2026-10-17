import { GridIcon, SettingsIcon, CoinIcon, FileTextIcon, WalletIcon, QrCodeIcon, ClockIcon } from '../icons'

export type PdvScreen = 'tables' | 'settings' | 'quick-sale' | 'nfce' | 'cash-register' | 'tokens' | 'sales'

interface SidebarProps {
  screen: PdvScreen
  onNavigate: (screen: PdvScreen) => void
  showTables?: boolean
  showQuickSale?: boolean
  showNfce?: boolean
  showCashRegister?: boolean
  showTokens?: boolean
  showSalesHistory?: boolean
}

// Só aparece em telas largas (desktop) - no celular/tablet estreito a
// navegação fica no botão de engrenagem dentro do próprio TableGrid.
export function Sidebar({
  screen,
  onNavigate,
  showTables = true,
  showQuickSale = false,
  showNfce = false,
  showCashRegister = false,
  showTokens = false,
  showSalesHistory = false,
}: SidebarProps) {
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
      {showSalesHistory && (
        <button
          type="button"
          onClick={() => onNavigate('sales')}
          title="Vendas e reimpressão"
          className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[9.5px] font-bold transition ${
            screen === 'sales'
              ? 'bg-[var(--blue-100)] text-[var(--blue-700)]'
              : 'text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]'
          }`}
        >
          <ClockIcon className="h-4 w-4" />
          Histórico
        </button>
      )}
      {showNfce && (
        <button
          type="button"
          onClick={() => onNavigate('nfce')}
          title="NFC-e"
          className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[9.5px] font-bold transition ${
            screen === 'nfce'
              ? 'bg-[var(--blue-100)] text-[var(--blue-700)]'
              : 'text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]'
          }`}
        >
          <FileTextIcon className="h-4 w-4" />
          NFC-e
        </button>
      )}
      {showCashRegister && (
        <button
          type="button"
          onClick={() => onNavigate('cash-register')}
          title="Caixa"
          className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[9.5px] font-bold transition ${
            screen === 'cash-register'
              ? 'bg-[var(--blue-100)] text-[var(--blue-700)]'
              : 'text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]'
          }`}
        >
          <WalletIcon className="h-4 w-4" />
          Caixa
        </button>
      )}
      {showTokens && (
        <button
          type="button"
          onClick={() => onNavigate('tokens')}
          title="Troca de fichas"
          className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[9.5px] font-bold transition ${
            screen === 'tokens'
              ? 'bg-[var(--blue-100)] text-[var(--blue-700)]'
              : 'text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]'
          }`}
        >
          <QrCodeIcon className="h-4 w-4" />
          Fichas
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

// Barra de navegação do celular (no lugar do menu lateral): os mesmos destinos, no rodapé e com alvos grandes.
export function MobileNav({
  screen,
  onNavigate,
  showTables = true,
  showQuickSale = false,
  showNfce = false,
  showCashRegister = false,
  showTokens = false,
  showSalesHistory = false,
}: SidebarProps) {
  const items = [
    showTables && { key: 'tables' as const, label: 'Mesas', icon: GridIcon },
    showQuickSale && { key: 'quick-sale' as const, label: 'Venda', icon: CoinIcon },
    showSalesHistory && { key: 'sales' as const, label: 'Histórico', icon: ClockIcon },
    showNfce && { key: 'nfce' as const, label: 'NFC-e', icon: FileTextIcon },
    showCashRegister && { key: 'cash-register' as const, label: 'Caixa', icon: WalletIcon },
    showTokens && { key: 'tokens' as const, label: 'Fichas', icon: QrCodeIcon },
    { key: 'settings' as const, label: 'Ajustes', icon: SettingsIcon },
  ].filter(Boolean) as { key: PdvScreen; label: string; icon: typeof GridIcon }[]

  return (
    <nav className="flex flex-none items-stretch justify-around border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map((item) => {
        const Icon = item.icon
        const active = screen === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.key)}
            className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10.5px] font-bold transition ${
              active ? 'text-[var(--blue-700)]' : 'text-[var(--ink-soft)]'
            }`}
          >
            <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? 'bg-[var(--blue-100)]' : ''}`}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
