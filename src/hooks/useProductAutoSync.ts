import { useEffect } from 'react'
import { downloadCatalog, isCatalogSyncing } from '../lib/productSync'

// De quanto em quanto tempo o PDV baixa os produtos de novo sozinho (preço novo, produto cadastrado
// no administrativo...), sem o operador ir em Ajustes.
const AUTO_SYNC_MS = 10 * 60 * 1000

// Atualização silenciosa do catálogo local: ao abrir o PDV (a não ser que o catálogo tenha acabado de
// ser baixado), no intervalo acima e quando a internet volta. Falha (sem internet, servidor fora) não
// incomoda o caixa - tenta de novo na próxima vez.
export function useProductAutoSync(token: string, companyId: string, enabled: boolean, syncOnStart: boolean) {
  useEffect(() => {
    if (!enabled) return

    function sync() {
      if (isCatalogSyncing() || !navigator.onLine) return
      downloadCatalog(token, companyId).catch(() => undefined)
    }

    if (syncOnStart) sync()
    const timer = setInterval(sync, AUTO_SYNC_MS)
    window.addEventListener('online', sync)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', sync)
    }
    // syncOnStart só vale na primeira vez que liga; mudar depois não dispara outra atualização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, companyId, enabled])
}
