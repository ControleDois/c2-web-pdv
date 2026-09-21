import { useEffect, useState } from 'react'
import { ProductSyncPage } from './ProductSyncPage'
import { QuickSaleSettingsPage } from './QuickSaleSettingsPage'
import { QuickSalePage } from './QuickSalePage'
import { TableGrid } from '../components/pdv/TableGrid'
import { TableDetail } from '../components/pdv/TableDetail'
import { Sidebar, type PdvScreen } from '../components/pdv/Sidebar'
import { useFoodTables } from '../hooks/useFoodTables'
import { useMyCompanyPerson } from '../hooks/useMyCompanyPerson'
import { updateDeliveryOrderStatus, fetchIfoodCancellationReasons, cancelIfoodOrder } from '../lib/foodApi'
import { isIfoodOrder, newLocalId } from '../lib/foodTypes'
import { countProducts } from '../lib/db'
import type { FoodTable } from '../lib/foodTypes'
import type { AuthCompany, AuthSession } from '../lib/auth'

interface PdvPageProps {
  session: AuthSession
  company: AuthCompany
  onCompanyUpdate: (company: AuthCompany) => void
}

type SyncStatus = 'checking' | 'needs-sync' | 'ready'
type SettingsTab = 'catalog' | 'quick-sale'

export function PdvPage({ session, company, onCompanyUpdate }: PdvPageProps) {
  const quickSaleEnabled = Boolean(company.config?.quick_sale_enabled)
  const quickSaleOnlyMode = quickSaleEnabled && Boolean(company.config?.quick_sale_only_mode)

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('checking')
  const [screen, setScreen] = useState<PdvScreen>(quickSaleOnlyMode ? 'quick-sale' : 'tables')
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('catalog')

  // Se o ajuste "somente venda rápida" for ligado/desligado enquanto o PDV
  // já está aberto (ex: em outra aba), mantém a tela coerente com o modo.
  useEffect(() => {
    if (quickSaleOnlyMode && screen === 'tables') setScreen('quick-sale')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickSaleOnlyMode])
  const { tables, saveTable, setSelectedTableId, reloadFromDb, refreshFromServer } = useFoodTables(session, company)
  const myPerson = useMyCompanyPerson(session, company)
  const [tableSearch, setTableSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    countProducts().then((count) => {
      if (!cancelled) setSyncStatus(count > 0 ? 'ready' : 'needs-sync')
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (syncStatus === 'checking') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--blue-300)] border-t-[var(--blue-500)]" />
      </div>
    )
  }

  // Só força a sincronização quando nunca rodou antes (0 produtos salvos) -
  // depois disso, atualizar o cardápio é uma ação em Configurações, não uma
  // trava toda vez que o PDV abre.
  if (syncStatus === 'needs-sync') {
    return <ProductSyncPage session={session} company={company} onReady={() => setSyncStatus('ready')} />
  }

  const selectedTable = tables.find((table) => table.id === selectedId) ?? null

  function handleTableInputSubmit() {
    const number = Number(tableSearch)
    if (!number || number <= 0) {
      setTableSearch('')
      return
    }

    const existing = tables.find((table) => table.number === number && table.status !== 'canceled')
    if (existing) {
      enterTable(existing)
      return
    }

    const now = new Date().toISOString()
    const table: FoodTable = {
      id: newLocalId(),
      companyId: company.id,
      user_id: myPerson?.id ?? null,
      synchronized: 'N',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      number,
      status: 'open_empty',
      opened_at: now,
      closed_at: null,
      last_order_at: null,
      items: [],
      orders: [],
      partials: [],
      sales: [],
      audit: [
        {
          id: newLocalId(),
          companyId: company.id,
          user_id: myPerson?.id ?? null,
          synchronized: 'N',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          moment: now,
          description: `ABERTURA DA MESA ${number}`,
          reason: '',
          author: myPerson?.id ?? '',
          author_name: myPerson?.name ?? '',
          type: 'default',
          requested_by_client: false,
        },
      ],
    }

    saveTable(table).then(() => enterTable(table))
    setTableSearch('')
  }

  function enterTable(table: FoodTable) {
    setSelectedId(table.id)
    setSelectedTableId(table.id)
    // Pedido do iFood aberto sem número/ID (cópia local antiga): busca do
    // servidor na hora pra mostrar e permitir despachar.
    if (isIfoodOrder(table) && !table.delivery_order?.external_display_id) {
      refreshFromServer().catch(() => undefined)
    }
  }

  function exitTable() {
    setSelectedId(null)
    setSelectedTableId(null)
    reloadFromDb()
  }

  async function handleAdvanceDeliveryStatus(status: string) {
    if (!selectedTable?.delivery_order) return
    // O erro sobe pro TableDetail mostrar (ex: o iFood recusou a mudança).
    await updateDeliveryOrderStatus(session.token.token, selectedTable.delivery_order.id, status)
    await saveTable({
      ...selectedTable,
      delivery_order: { ...selectedTable.delivery_order, status: status as any },
    })
  }

  async function handleLoadIfoodCancellationReasons() {
    if (!selectedTable?.delivery_order) return []
    return fetchIfoodCancellationReasons(session.token.token, selectedTable.delivery_order.id)
  }

  async function handleCancelIfoodOrder(code: string, reason: string) {
    if (!selectedTable?.delivery_order) return
    await cancelIfoodOrder(session.token.token, selectedTable.delivery_order.id, {
      cancellation_code: code,
      reason,
    })
    await saveTable({
      ...selectedTable,
      status: 'canceled',
      closed_at: new Date().toISOString(),
      delivery_order: { ...selectedTable.delivery_order, status: 'canceled' },
    })
    exitTable()
  }

  if (selectedTable) {
    return (
      <TableDetail
        table={selectedTable}
        authorId={myPerson?.id ?? ''}
        authorName={myPerson?.name ?? ''}
        onBack={exitTable}
        onSave={(updated) => saveTable(updated)}
        onAdvanceDeliveryStatus={handleAdvanceDeliveryStatus}
        onLoadIfoodCancellationReasons={handleLoadIfoodCancellationReasons}
        onCancelIfoodOrder={handleCancelIfoodOrder}
      />
    )
  }

  const homeScreen: PdvScreen = quickSaleOnlyMode ? 'quick-sale' : 'tables'

  return (
    <div className="flex h-full">
      <Sidebar
        screen={screen}
        onNavigate={setScreen}
        showTables={!quickSaleOnlyMode}
        showQuickSale={quickSaleEnabled}
      />
      <div className="min-h-0 min-w-0 flex-1">
        {screen === 'settings' ? (
          <div className="flex h-full flex-col">
            <div className="flex flex-none gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-4 pt-3">
              <button
                type="button"
                onClick={() => setSettingsTab('catalog')}
                className={`rounded-t-lg px-3.5 py-2 text-[12.5px] font-bold transition ${
                  settingsTab === 'catalog'
                    ? 'border-b-2 border-[var(--blue-500)] text-[var(--blue-700)]'
                    : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                }`}
              >
                Cardápio
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('quick-sale')}
                className={`rounded-t-lg px-3.5 py-2 text-[12.5px] font-bold transition ${
                  settingsTab === 'quick-sale'
                    ? 'border-b-2 border-[var(--blue-500)] text-[var(--blue-700)]'
                    : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                }`}
              >
                Venda Rápida
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {settingsTab === 'catalog' ? (
                <div className="flex justify-center p-4 sm:p-6">
                  <ProductSyncPage
                    session={session}
                    company={company}
                    embedded
                    onBack={() => setScreen(homeScreen)}
                    onReady={() => setScreen(homeScreen)}
                  />
                </div>
              ) : (
                <QuickSaleSettingsPage
                  session={session}
                  company={company}
                  onBack={() => setScreen(homeScreen)}
                  onCompanyUpdate={onCompanyUpdate}
                />
              )}
            </div>
          </div>
        ) : screen === 'quick-sale' ? (
          <QuickSalePage session={session} company={company} onExit={() => setScreen(homeScreen)} />
        ) : (
          <TableGrid
            tables={tables}
            search={tableSearch}
            onSearchChange={setTableSearch}
            onSubmit={handleTableInputSubmit}
            onSelect={enterTable}
            onOpenSettings={() => setScreen('settings')}
            onOpenQuickSale={quickSaleEnabled ? () => setScreen('quick-sale') : undefined}
          />
        )}
      </div>
    </div>
  )
}
