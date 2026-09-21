import { useCallback, useEffect, useRef, useState } from 'react'
import { getAllTables, putTable, deleteTable } from '../lib/db'
import { syncTable, pullTables, normalizeRemoteTable, type FoodSyncPayload } from '../lib/foodApi'
import { connectSocket, getSocketId } from '../lib/socket'
import type { FoodTable } from '../lib/foodTypes'
import type { AuthSession, AuthCompany } from '../lib/auth'

const SYNC_INTERVAL_MS = 10000

export function useFoodTables(session: AuthSession, company: AuthCompany) {
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

  // Push a cada 10s de tudo que estiver synchronized:'N'.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (syncingRef.current) return
      syncingRef.current = true
      try {
        const pending = (await getAllTables()).filter((table) => table.synchronized === 'N')
        for (const table of pending) {
          const payload: FoodSyncPayload = {
            device_id: getSocketId() || '',
            id: table.id,
            companyId: company.id,
            number: table.number,
            status: table.status,
            opened_at: table.opened_at,
            closed_at: table.closed_at,
            items: table.items,
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
              await putTable({ ...table, synchronized: 'S' })
            }
          } catch {
            // Fica pendente, tenta de novo no próximo ciclo — mesmo
            // comportamento do Angular (sem retry/backoff especial).
          }
        }
        await reloadFromDb()
      } finally {
        syncingRef.current = false
      }
    }, SYNC_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [session.token.token, company.id, reloadFromDb])

  // Socket.io: entra na sala da empresa e escuta atualização de mesa.
  useEffect(() => {
    const socket = connectSocket(company.id)

    function handleTableUpdated(payload: { table?: unknown; sourceDeviceId?: string }) {
      if (!payload?.table) return
      if (payload.sourceDeviceId && payload.sourceDeviceId === getSocketId()) return

      const remote = normalizeRemoteTable(payload.table)
      // Mesa aberta na tela no momento: ignora, sem merge (mesmo
      // comportamento do Angular — evita sobrescrever edição em andamento).
      if (selectedTableIdRef.current === remote.id) return

      putTable(remote).then(reloadFromDb)
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

  return { tables, saveTable, setSelectedTableId, reloadFromDb, refreshFromServer: pullAndMerge }
}
