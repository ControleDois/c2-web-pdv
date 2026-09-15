import { useEffect, useState } from 'react'
import { ProductSyncPage } from './ProductSyncPage'
import { TableGrid } from '../components/pdv/TableGrid'
import { TableDetail } from '../components/pdv/TableDetail'
import { Sidebar } from '../components/pdv/Sidebar'
import { useFoodTables } from '../hooks/useFoodTables'
import { useMyCompanyPerson } from '../hooks/useMyCompanyPerson'
import { updateDeliveryOrderStatus } from '../lib/foodApi'
import { newLocalId } from '../lib/foodTypes'
import { countProducts } from '../lib/db'
import type { FoodTable } from '../lib/foodTypes'
import type { AuthCompany, AuthSession } from '../lib/auth'

interface PdvPageProps {
  session: AuthSession
  company: AuthCompany
}

type SyncStatus = 'checking' | 'needs-sync' | 'ready'
type Screen = 'tables' | 'settings'

export function PdvPage({ session, company }: PdvPageProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('checking')
  const [screen, setScreen] = useState<Screen>('tables')
  const { tables, saveTable, setSelectedTableId, reloadFromDb } = useFoodTables(session, company)
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
  }

  function exitTable() {
    setSelectedId(null)
    setSelectedTableId(null)
    reloadFromDb()
  }

  async function handleAdvanceDeliveryStatus(status: string) {
    if (!selectedTable?.delivery_order) return
    try {
      await updateDeliveryOrderStatus(session.token.token, selectedTable.delivery_order.id, status)
      await saveTable({
        ...selectedTable,
        delivery_order: { ...selectedTable.delivery_order, status: status as any },
      })
    } catch {
      // Sem feedback visual, mesmo comportamento do Angular — só não avança.
    }
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
      />
    )
  }

  return (
    <div className="flex h-full">
      <Sidebar screen={screen} onNavigate={setScreen} />
      <div className="min-h-0 min-w-0 flex-1">
        {screen === 'settings' ? (
          <ProductSyncPage
            session={session}
            company={company}
            embedded
            onBack={() => setScreen('tables')}
            onReady={() => setScreen('tables')}
          />
        ) : (
          <TableGrid
            tables={tables}
            search={tableSearch}
            onSearchChange={setTableSearch}
            onSubmit={handleTableInputSubmit}
            onSelect={enterTable}
            onOpenSettings={() => setScreen('settings')}
          />
        )}
      </div>
    </div>
  )
}
