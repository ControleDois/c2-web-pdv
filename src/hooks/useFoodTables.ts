import { useCallback, useEffect, useRef, useState } from 'react'
import { getAllTables, putTable, deleteTable } from '../lib/db'
import { syncTable, pullTables, normalizeRemoteTable, type FoodSyncPayload } from '../lib/foodApi'
import { connectSocket, getSocketId } from '../lib/socket'
import type { FoodTable, FoodTableItem } from '../lib/foodTypes'
import type { AuthSession, AuthCompany } from '../lib/auth'

const SYNC_INTERVAL_MS = 10000

// Itens novos que chegaram de outro aparelho (garçom, cardápio, iFood) - o PDV toca e destaca a mesa.
export type NewItemsListener = (table: FoodTable, items: FoodTableItem[]) => void

export function useFoodTables(session: AuthSession, company: AuthCompany, onNewItems?: NewItemsListener) {
  const onNewItemsRef = useRef(onNewItems)
  onNewItemsRef.current = onNewItems
  const [tables, setTables] = useState<FoodTable[]>([])
  const selectedTableIdRef = useRef<string | null>(null)
  const syncingRef = useRef(false)

  const reloadFromDb = useCallback(async () => {
    const all = await getAllTables()
    setTables(all.sort((a, b) => a.number - b.number))
  }, [])

  // Traz as mesas do servidor pro banco local. Edição local pendente vence
  // sobre o pull, EXCETO os dados do pedido de delivery/iFood (número, ID,
  // status): esses são do servidor, então sempre atualizam - senão uma mesa
  // pendente ficava pra sempre com a cópia antiga do pedido.
  const pullAndMerge = useCallback(async () => {
    const raw = await pullTables(session.token.token, company.id)
    if (!Array.isArray(raw)) return
    const remoteIds = new Set<string>()
    for (const rawTable of raw) {
      const remote = normalizeRemoteTable(rawTable)
      remoteIds.add(remote.id)
      const current = await getAllTables()
      const local = current.find((table) => table.id === remote.id)
      if (local && local.synchronized === 'N') {
        if (remote.delivery_order) {
          await putTable({ ...local, delivery_order: { ...local.delivery_order, ...remote.delivery_order } })
        }
        continue
      }
      await putTable(remote)
    }

    // O servidor só devolve mesas abertas. Cópia local já sincronizada que
    // não veio nessa lista foi fechada/cancelada em outro lugar (ex: pedido
    // do iFood cancelado) - sem apagar, ela ficava aparecendo pra sempre.
    // Mesa com alteração local pendente ('N') nunca é apagada.
    for (const local of await getAllTables()) {
      if (local.synchronized === 'S' && !remoteIds.has(local.id)) {
        await deleteTable(local.id)
      }
    }
    await reloadFromDb()
  }, [session.token.token, company.id, reloadFromDb])

  // Carga inicial (local) + pull do servidor no boot (o Angular também só faz
  // pull completo uma vez no boot, não periodicamente).
  useEffect(() => {
    reloadFromDb()

    pullAndMerge().catch(() => {
      // Sem servidor disponível no boot, segue só com o que já tem local.
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id])

  // Envia ao servidor tudo que estiver synchronized:'N'. A mesa aberta na tela com itens
  // recém-lançados espera o operador sair (ou tocar em "Enviar pedido"): assim o pedido sai
  // de uma vez na impressora da cozinha/bar, e não um papel por item.
  const pushPending = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    try {
      const pending = (await getAllTables()).filter((table) => table.synchronized === 'N')
      for (const table of pending) {
        const holding = table.items.some((item) => item.print_hold && !item.removed)
        if (holding && table.id === selectedTableIdRef.current) continue
        const payload: FoodSyncPayload = {
          device_id: getSocketId() || '',
          source: 'pdv',
          id: table.id,
          companyId: company.id,
          number: table.number,
          status: table.status,
          opened_at: table.opened_at,
          closed_at: table.closed_at,
          items: table.items.map(({ print_hold: _hold, ...item }) => item),
          orders: table.orders,
          partials: table.partials,
          sales: table.sales,
          audit: table.audit,
        }
        try {
          await syncTable(session.token.token, company.id, payload)
          if (table.status === 'closed' || table.status === 'canceled') {
            await deleteTable(table.id)
          } else {
            // Só marca como enviada se ninguém mexeu na mesa enquanto ia para o servidor.
            const latest = (await getAllTables()).find((item) => item.id === table.id)
            if (latest && latest.updatedAt === table.updatedAt) {
              await putTable({
                ...table,
                synchronized: 'S',
                items: table.items.map((item) => ({ ...item, print_hold: false, pending_print: false })),
              })
            }
          }
        } catch {
          // Fica pendente, tenta de novo no próximo ciclo.
        }
      }
      await reloadFromDb()
    } finally {
      syncingRef.current = false
    }
  }, [session.token.token, company.id, reloadFromDb])

  useEffect(() => {
    const interval = setInterval(() => void pushPending(), SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [pushPending])

  // Socket.io: entra na sala da empresa e escuta atualização de mesa.
  useEffect(() => {
    const socket = connectSocket(company.id)

    function handleTableUpdated(payload: { table?: unknown; sourceDeviceId?: string; source?: string | null }) {
      if (!payload?.table) return
      if (payload.sourceDeviceId && payload.sourceDeviceId === getSocketId()) return

      const remote = normalizeRemoteTable(payload.table)
      void getAllTables().then((current) => {
        const local = current.find((table) => table.id === remote.id)
        const known = new Set((local?.items ?? []).map((item) => item.id))
        const arrived = remote.items.filter((item) => !item.removed && !known.has(item.id))
        const open = remote.status !== 'closed' && remote.status !== 'canceled'
        if (arrived.length > 0 && open && payload.source !== 'pdv') onNewItemsRef.current?.(remote, arrived)

        // Mesa aberta na tela no momento: ignora, sem merge (mesmo
        // comportamento do Angular — evita sobrescrever edição em andamento).
        // Os itens que chegaram de outro aparelho entram na tela sem mexer no resto.
        if (selectedTableIdRef.current === remote.id) {
          if (local && arrived.length > 0) {
            const knownOrders = new Set(local.orders.map((order) => order.id))
            void putTable({
              ...local,
              items: [...local.items, ...arrived],
              orders: [...local.orders, ...remote.orders.filter((order) => !knownOrders.has(order.id))],
              audit: [...local.audit, ...remote.audit.filter((entry) => !local.audit.some((mine) => mine.id === entry.id))],
              status: 'open_with_items',
            }).then(reloadFromDb)
          }
          return
        }
        putTable(remote).then(reloadFromDb)
      })
    }

    socket.on('food:table:updated', handleTableUpdated)

    return () => {
      socket.off('food:table:updated', handleTableUpdated)
    }
  }, [company.id, reloadFromDb])

  function setSelectedTableId(id: string | null) {
    selectedTableIdRef.current = id
  }

  async function saveTable(table: FoodTable) {
    const updated: FoodTable = { ...table, synchronized: 'N', updatedAt: new Date().toISOString() }
    await putTable(updated)
    await reloadFromDb()
    return updated
  }

  return { tables, saveTable, setSelectedTableId, reloadFromDb, refreshFromServer: pullAndMerge, syncNow: pushPending }
}
