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

  // Carga inicial (local) + pull único do servidor (o Angular também só faz
  // pull completo uma vez no boot, não periodicamente).
  useEffect(() => {
    let cancelled = false

    reloadFromDb()

    pullTables(session.token.token, company.id)
      .then(async (raw) => {
        if (cancelled) return
        for (const rawTable of raw) {
          const remote = normalizeRemoteTable(rawTable)
          const current = await getAllTables()
          const local = current.find((table) => table.id === remote.id)
          // Edição local pendente sempre vence sobre o pull.
          if (local && local.synchronized === 'N') continue
          await putTable(remote)
        }
        if (!cancelled) await reloadFromDb()
      })
      .catch(() => {
        // Sem servidor disponível no boot, segue só com o que já tem local.
      })

    return () => {
      cancelled = true
    }
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

  return { tables, saveTable, setSelectedTableId, reloadFromDb }
}
