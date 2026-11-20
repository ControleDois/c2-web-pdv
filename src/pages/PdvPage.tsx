import { useEffect, useRef, useState } from 'react'
import { ProductSyncPage } from './ProductSyncPage'
import { QuickSaleSettingsPage } from './QuickSaleSettingsPage'
import { QuickSalePage } from './QuickSalePage'
import { NfceListPage } from './NfceListPage'
import { NfseListPage } from './NfseListPage'
import { TokenRedeemPage } from './TokenRedeemPage'
import { SalesHistoryPage } from './SalesHistoryPage'
import { CashRegisterPage } from './CashRegisterPage'
import { TerminalPickerPage } from './TerminalPickerPage'
import { TableGrid } from '../components/pdv/TableGrid'
import { TableDetail } from '../components/pdv/TableDetail'
import { PrintPreviewModal } from '../components/pdv/PrintPreviewModal'
import { createPrintJob, reprintProductionOrder, type PrintDocument } from '../lib/printing'
import { fetchCashRegisterStatus } from '../lib/cashRegister'
import { fetchFoodMenu, loadCachedMenu, type FoodMenu } from '../lib/foodMenu'
import { NewOrderAlert, type TableOrderAlert } from '../components/pdv/NewOrderAlert'
import { TableInfoModal, type TableInfo } from '../components/pdv/TableInfoModal'
import { orderChime } from '../lib/beep'
import { Sidebar, MobileNav, type PdvScreen } from '../components/pdv/Sidebar'
import { useFoodTables } from '../hooks/useFoodTables'
import { useMyCompanyPerson } from '../hooks/useMyCompanyPerson'
import { useProductAutoSync } from '../hooks/useProductAutoSync'
import { updateDeliveryOrderStatus, fetchIfoodCancellationReasons, cancelIfoodOrder } from '../lib/foodApi'
import { isIfoodOrder, newLocalId } from '../lib/foodTypes'
import { catalogLacksRole, countProducts } from '../lib/db'
import { saleTokensEnabled } from '../lib/config'
import {
  fetchCompanyTerminals,
  loadSelectedTerminalId,
  saveSelectedTerminalId,
  type CompanyTerminalOption,
  type PdvPrinters,
} from '../lib/terminal'
import type { FoodTable, FoodTableItem } from '../lib/foodTypes'
import type { AuthCompany, AuthSession } from '../lib/auth'

// Sentinela salvo quando o operador escolhe "continuar sem terminal" - some
// caso contrário null e "ainda não decidiu" ficariam indistinguíveis, e o
// seletor voltaria a aparecer toda vez que o PDV abrisse.
const NO_TERMINAL = 'none'

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
  // Menu NFC-e só aparece se a empresa realmente emite NFC-e pelo PDV
  // (ajuste "NFC-e na venda rápida" em Configurações → Venda Rápida).
  const nfceEnabled = Boolean(company.config?.quick_sale_nfce_mode && company.config.quick_sale_nfce_mode !== 'off')
  const nfseEnabled = Boolean(company.config?.quick_sale_nfse_mode && company.config.quick_sale_nfse_mode !== 'off')
  // Menu Caixa só aparece se a empresa tiver o controle de caixa ativo
  // (Configurações → Caixa no administrativo).
  const cashRegisterEnabled = Number(company.config?.central_box_active || 0) === 1
  // Menu Fichas: venda rápida ligada e fichas ativas nos Ajustes do PDV.
  const tokensEnabled = quickSaleEnabled && saleTokensEnabled(company.config)

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('checking')
  // Catálogo acabou de ser baixado na primeira abertura: a atualização automática não baixa de novo na hora.
  const justSynced = useRef(false)
  useProductAutoSync(session.token.token, company.id, syncStatus === 'ready', !justSynced.current)
  const [screen, setScreen] = useState<PdvScreen>(quickSaleOnlyMode ? 'quick-sale' : 'tables')
  const [cashBlocked, setCashBlocked] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('catalog')
  // Venda em andamento no celular: a barra de navegação sai para dar lugar ao carrinho.
  const [saleActive, setSaleActive] = useState(false)

  // Terminal (PDV) escolhido pra este computador - quando tem um configurado
  // com servidor local próprio, a NFC-e passa a ser gerada por ele em vez do
  // servidor padrão (Configurações → Terminais, no administrativo).
  const [terminals, setTerminals] = useState<CompanyTerminalOption[]>([])
  const [terminalsLoaded, setTerminalsLoaded] = useState(false)
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(() => loadSelectedTerminalId(company.id))

  useEffect(() => {
    let cancelled = false
    setTerminalsLoaded(false)
    fetchCompanyTerminals(session.token.token, company.id)
      .then((res) => {
        if (!cancelled) setTerminals(res)
      })
      .catch(() => {
        if (!cancelled) setTerminals([])
      })
      .finally(() => {
        if (!cancelled) setTerminalsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [session.token.token, company.id])

  function handleSelectTerminal(terminal: CompanyTerminalOption) {
    saveSelectedTerminalId(company.id, terminal.id)
    setSelectedTerminalId(terminal.id)
  }

  function handleSkipTerminal() {
    saveSelectedTerminalId(company.id, NO_TERMINAL)
    setSelectedTerminalId(NO_TERMINAL)
  }

  function handleChangeTerminal() {
    saveSelectedTerminalId(company.id, null)
    setSelectedTerminalId(null)
  }

  const selectedTerminal = terminals.find((terminal) => terminal.id === selectedTerminalId) ?? null
  // Terminal escolhido antes mas que sumiu/foi desativado - trata como
  // "ainda não decidiu" pra pedir de novo, em vez de mandar um id inválido.
  const terminalNeedsReselect = Boolean(
    selectedTerminalId && selectedTerminalId !== NO_TERMINAL && terminalsLoaded && !selectedTerminal
  )
  const showTerminalPicker =
    terminalsLoaded && terminals.length > 0 && (!selectedTerminalId || terminalNeedsReselect)
  const activeTerminalId = selectedTerminal?.id
  // Com terminal escolhido, imprime só nas impressoras dele (sem vínculo = preview);
  // sem terminal, vale o padrão da empresa.
  const printers: PdvPrinters = selectedTerminal
    ? {
        receiptPrinterId: selectedTerminal.receiptPrinterId || null,
        nfcePrinterId: selectedTerminal.nfcePrinterId || null,
      }
    : {
        receiptPrinterId: company.config?.quick_sale_receipt_printer_id || null,
        nfcePrinterId: company.config?.quick_sale_nfce_printer_id || null,
      }

  // Fichas desligadas nos Ajustes com a tela de fichas aberta: volta para o início.
  useEffect(() => {
    if (!tokensEnabled && screen === 'tokens') setScreen(quickSaleOnlyMode ? 'quick-sale' : 'tables')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokensEnabled])

  // Se o ajuste "somente venda rápida" for ligado/desligado enquanto o PDV
  // já está aberto (ex: em outra aba), mantém a tela coerente com o modo.
  useEffect(() => {
    if (quickSaleOnlyMode && screen === 'tables') setScreen('quick-sale')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickSaleOnlyMode])
  // Pedido novo vindo de outro aparelho (garçom, cardápio, iFood): toca até o caixa ver e destaca a mesa.
  const [orderAlerts, setOrderAlerts] = useState<TableOrderAlert[]>([])
  const handleNewItems = (table: FoodTable, items: FoodTableItem[]) => {
    const label = isIfoodOrder(table)
      ? `iFood ${table.delivery_order?.external_display_id || table.number}`
      : table.delivery_order || table.number >= 9000
        ? `Delivery ${table.number}`
        : `Mesa ${table.number}`
    setOrderAlerts((current) => {
      const existing = current.find((alert) => alert.tableId === table.id)
      const merged = [...(existing?.items ?? []), ...items.map((item) => ({ name: item.name, quantity: item.quantity }))]
      const total = (existing?.total ?? 0) + items.reduce((sum, item) => sum + (item.sub_total || item.total || 0), 0)
      return [{ tableId: table.id, label, items: merged, total, at: Date.now() }, ...current.filter((alert) => alert.tableId !== table.id)]
    })
    orderChime()
  }
  const { tables, saveTable, setSelectedTableId, reloadFromDb, refreshFromServer, syncNow, sendTableNow } = useFoodTables(session, company, handleNewItems)

  // Toca de novo a cada 6 segundos e pisca o título da aba até o caixa dar ciente ou abrir a mesa.
  useEffect(() => {
    if (orderAlerts.length === 0) return
    const ring = setInterval(() => orderChime(), 6000)
    const original = document.title
    let flip = false
    const title = setInterval(() => {
      flip = !flip
      document.title = flip ? `🔔 (${orderAlerts.length}) Novo pedido!` : original
    }, 1000)
    return () => {
      clearInterval(ring)
      clearInterval(title)
      document.title = original
    }
  }, [orderAlerts.length])
  const myPerson = useMyCompanyPerson(session, company)
  const [tableSearch, setTableSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newDeliveryOpen, setNewDeliveryOpen] = useState(false)
  const [tablePreview, setTablePreview] = useState<{ title: string; documents: PrintDocument[] } | null>(null)
  // Cardápio das mesas (com adicionais): abre com a cópia do aparelho e atualiza do servidor.
  const [foodMenu, setFoodMenu] = useState<FoodMenu | null>(() => loadCachedMenu(company.id))
  const idleAlertMinutes = Number(company.config?.food_table_idle_alert_minutes ?? foodMenu?.idle_alert_minutes ?? 30)
  const refreshFoodMenu = () =>
    fetchFoodMenu(session.token.token, company.id)
      .then(setFoodMenu)
      .catch(() => undefined)
  useEffect(() => {
    void refreshFoodMenu()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id])

  useEffect(() => {
    let cancelled = false
    // Catálogo baixado por uma versão antiga não guarda se o item é produto ou serviço: baixa de novo.
    Promise.all([countProducts(), catalogLacksRole()]).then(([count, outdated]) => {
      if (!cancelled) setSyncStatus(count > 0 && !outdated ? 'ready' : 'needs-sync')
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

  if (showTerminalPicker) {
    return <TerminalPickerPage terminals={terminals} onSelect={handleSelectTerminal} onSkip={handleSkipTerminal} />
  }

  // Só força a sincronização quando nunca rodou antes (0 produtos salvos) - já começa a baixar
  // sozinha e, ao terminar, entra no PDV. Depois disso o catálogo se atualiza em segundo plano.
  if (syncStatus === 'needs-sync') {
    return (
      <ProductSyncPage
        session={session}
        company={company}
        onReady={() => {
          justSynced.current = true
          setSyncStatus('ready')
        }}
      />
    )
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

    openNewTable(number)
    setTableSearch('')
  }

  function openNewTable(number: number, extra: Partial<FoodTable> = {}, openingText = `ABERTURA DA MESA ${number}`) {
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
      ...extra,
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
          description: openingText,
          reason: '',
          author: myPerson?.id ?? '',
          author_name: myPerson?.name ?? '',
          type: 'default',
          requested_by_client: false,
        },
      ],
    }

    saveTable(table).then(() => enterTable(table))
  }

  // Delivery lançado no PDV (cliente sem app de delivery): numeração própria a partir de 9001.
  function createManualDelivery(info: TableInfo) {
    const used = new Set(tables.filter((table) => table.status !== 'closed' && table.status !== 'canceled').map((table) => table.number))
    let number = 9001
    while (used.has(number) && number < 9999) number++
    setNewDeliveryOpen(false)
    openNewTable(
      number,
      {
        kind: 'delivery',
        customer_name: info.customer_name || null,
        customer_phone: info.customer_phone || null,
        delivery_address: info.delivery_address || null,
        delivery_fee: info.delivery_fee,
      },
      `NOVO DELIVERY ${number - 9000}${info.customer_name ? ` - ${info.customer_name}` : ''}`
    )
  }

  function enterTable(table: FoodTable) {
    setOrderAlerts((current) => current.filter((alert) => alert.tableId !== table.id))
    void refreshFoodMenu()
    setSelectedId(table.id)
    setSelectedTableId(table.id)
    // Pedido do iFood aberto sem número/ID (cópia local antiga): busca do
    // servidor na hora pra mostrar e permitir despachar.
    if (isIfoodOrder(table) && !table.delivery_order?.external_display_id) {
      refreshFromServer().catch(() => undefined)
    }
  }

  // Caixa ativo: receber ou fechar mesa/delivery só com o caixa do operador aberto
  // (o servidor recusa a conta sem caixa e a mesa ficaria presa na sincronização).
  // Sem internet deixa seguir: o servidor confere quando sincronizar.
  async function ensureCashRegisterOpen(): Promise<boolean> {
    if (!cashRegisterEnabled) return true
    try {
      const status = await fetchCashRegisterStatus(session.token.token, company.id)
      if (!status.enabled || status.session) return true
      setCashBlocked(true)
      return false
    } catch {
      return true
    }
  }

  function exitTable() {
    setSelectedId(null)
    setSelectedTableId(null)
    reloadFromDb()
    // Saiu da mesa: o que foi lançado vai já para o servidor (e para a cozinha/bar).
    setTimeout(() => void syncNow(), 300)
  }

  // Manda o pedido da mesa aberta sem sair dela.
  function sendTableOrderNow(table: FoodTable) {
    const held = new Set(table.items.filter((item) => item.print_hold).map((item) => item.id))
    return sendTableNow({ ...table, items: table.items.map((item) => ({ ...item, print_hold: false })) }).catch(async (err) => {
      // Não foi: os itens voltam a "não enviado" na tela (vão quando o caixa sair da mesa ou tentar de novo).
      const current = tables.find((item) => item.id === table.id) ?? table
      await saveTable({ ...current, items: current.items.map((item) => (held.has(item.id) ? { ...item, print_hold: true } : item)) })
      throw err
    })
  }

  function reprintTableOrder(table: FoodTable) {
    return reprintProductionOrder(session.token.token, company.id, table.id)
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

  // Mesa: impressora de comprovante do terminal; sem impressora vinculada, abre a prévia
  // para imprimir pelo navegador.
  async function printTableDocument(title: string, document: PrintDocument) {
    if (printers.receiptPrinterId) {
      await createPrintJob(session.token.token, { company_id: company.id, printer_id: printers.receiptPrinterId, title, payload: document })
      return
    }
    setTablePreview((current) => (current ? { ...current, documents: [...current.documents, document] } : { title, documents: [document] }))
  }

  const orderAlertBanner = (
    <NewOrderAlert
      alerts={orderAlerts}
      onDismiss={() => setOrderAlerts([])}
      onOpen={(tableId) => {
        const table = tables.find((item) => item.id === tableId)
        setOrderAlerts((current) => current.filter((alert) => alert.tableId !== tableId))
        if (!table) return
        if (selectedId && selectedId !== tableId) exitTable()
        setScreen('tables')
        enterTable(table)
      }}
    />
  )

  const tablePreviewModal = (
    <PrintPreviewModal
      open={tablePreview !== null}
      title={tablePreview?.title ?? ''}
      documents={tablePreview?.documents ?? []}
      onClose={() => setTablePreview(null)}
    />
  )

  const cashBlockedModal = cashBlocked && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5 shadow-xl">
        <p className="text-[15px] font-bold text-[var(--ink)]">Caixa fechado</p>
        <p className="mt-1.5 text-[13px] text-[var(--ink-soft)]">
          Abra o seu caixa antes de receber ou fechar a mesa. Os itens lançados continuam na mesa.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setCashBlocked(false)}
            className="rounded-xl border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--ink-soft)]"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => {
              setCashBlocked(false)
              exitTable()
              setScreen('cash-register')
            }}
            className="rounded-xl bg-[var(--blue-500)] py-2.5 text-[13px] font-bold text-white"
          >
            Abrir caixa
          </button>
        </div>
      </div>
    </div>
  )

  if (selectedTable) {
    return (
      <>
      {tablePreviewModal}
      {orderAlertBanner}
      {cashBlockedModal}
      <TableDetail
        table={selectedTable}
        authorId={myPerson?.id ?? ''}
        authorName={myPerson?.name ?? ''}
        onBack={exitTable}
        onSave={(updated) => saveTable(updated)}
        onAdvanceDeliveryStatus={handleAdvanceDeliveryStatus}
        onLoadIfoodCancellationReasons={handleLoadIfoodCancellationReasons}
        onCancelIfoodOrder={handleCancelIfoodOrder}
        onPrint={printTableDocument}
        onSendOrder={() => sendTableOrderNow(selectedTable)}
        onReprintOrder={() => reprintTableOrder(selectedTable)}
        companyName={company.people?.name || 'Controle Dois'}
        companyDocument={company.people?.document}
        acquirerStorageKey={`c2_pdv_card_acquirer_${company.id}`}
        menu={foodMenu}
        idleAlertMinutes={idleAlertMinutes}
        onBeforeReceive={ensureCashRegisterOpen}
      />
      </>
    )
  }

  const homeScreen: PdvScreen = quickSaleOnlyMode ? 'quick-sale' : 'tables'

  const navProps = {
    screen,
    onNavigate: setScreen,
    showTables: !quickSaleOnlyMode,
    showQuickSale: quickSaleEnabled,
    showNfce: nfceEnabled,
    showNfse: nfseEnabled,
    showCashRegister: cashRegisterEnabled,
    showTokens: tokensEnabled,
    showSalesHistory: quickSaleEnabled,
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {tablePreviewModal}
      {orderAlertBanner}
      {newDeliveryOpen && (
        <TableInfoModal
          delivery
          title="Novo delivery"
          confirmLabel="Criar e lançar itens"
          onClose={() => setNewDeliveryOpen(false)}
          onConfirm={createManualDelivery}
        />
      )}
      <Sidebar
        screen={screen}
        onNavigate={setScreen}
        showTables={!quickSaleOnlyMode}
        showQuickSale={quickSaleEnabled}
        showNfce={nfceEnabled}
        showNfse={nfseEnabled}
        showCashRegister={cashRegisterEnabled}
        showTokens={tokensEnabled}
        showSalesHistory={quickSaleEnabled}
      />
      <div className="min-h-0 min-w-0 flex-1">
        {screen === 'settings' ? (
          <div className="flex h-full flex-col">
            {terminals.length > 0 && (
              <div className="flex flex-none items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
                <p className="text-[12px] text-[var(--ink-soft)]">
                  Terminal: <span className="font-bold text-[var(--ink)]">{selectedTerminal?.name ?? 'Nenhum'}</span>
                </p>
                <button
                  type="button"
                  onClick={handleChangeTerminal}
                  className="text-[12px] font-bold text-[var(--blue-700)] hover:underline"
                >
                  Trocar
                </button>
              </div>
            )}
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
          <QuickSalePage
            session={session}
            company={company}
            onExit={() => setScreen(homeScreen)}
            onOpenCashRegister={cashRegisterEnabled ? () => setScreen('cash-register') : undefined}
            terminalId={activeTerminalId}
            printers={printers}
            onSaleActiveChange={setSaleActive}
          />
        ) : screen === 'sales' ? (
          <SalesHistoryPage session={session} company={company} printers={printers} />
        ) : screen === 'tokens' ? (
          <TokenRedeemPage session={session} company={company} />
        ) : screen === 'nfce' ? (
          <NfceListPage session={session} company={company} />
        ) : screen === 'nfse' ? (
          <NfseListPage session={session} company={company} />
        ) : screen === 'cash-register' ? (
          <CashRegisterPage session={session} company={company} onPrint={printTableDocument} />
        ) : (
          <TableGrid
            tables={tables}
            search={tableSearch}
            onSearchChange={setTableSearch}
            onSubmit={handleTableInputSubmit}
            onSelect={enterTable}
            idleAlertMinutes={idleAlertMinutes}
            alertTableIds={orderAlerts.map((alert) => alert.tableId)}
            onNewDelivery={() => setNewDeliveryOpen(true)}
            onOpenSettings={() => setScreen('settings')}
            onOpenQuickSale={quickSaleEnabled ? () => setScreen('quick-sale') : undefined}
          />
        )}
      </div>
      {!(saleActive && screen === 'quick-sale') && <MobileNav {...navProps} />}
    </div>
  )
}
