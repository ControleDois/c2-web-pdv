import { useState } from 'react'
import { updateConfig } from '../lib/config'
import { ApiError } from '../lib/api'
import type { NfceMode } from '../lib/nfce'
import { ChevronLeftIcon, CheckCircleIcon, CoinIcon, PrinterIcon } from '../components/icons'
import type { AuthSession, AuthCompany } from '../lib/auth'

interface QuickSaleSettingsPageProps {
  session: AuthSession
  company: AuthCompany
  onBack: () => void
  onCompanyUpdate: (company: AuthCompany) => void
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none rounded-full transition ${
        checked ? 'bg-[var(--blue-500)]' : 'bg-[var(--border)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? 'left-5.5' : 'left-0.5'
        }`}
      />
    </button>
  )
}

export function QuickSaleSettingsPage({ session, company, onBack, onCompanyUpdate }: QuickSaleSettingsPageProps) {
  const config = company.config
  const [enabled, setEnabled] = useState(Boolean(config?.quick_sale_enabled))
  const [onlyMode, setOnlyMode] = useState(Boolean(config?.quick_sale_only_mode))
  const [askPreview, setAskPreview] = useState(Boolean(config?.quick_sale_ask_print_preview))
  const [printModel, setPrintModel] = useState<'thermal' | 'a4'>(config?.quick_sale_print_model ?? 'thermal')
  const [askQuantity, setAskQuantity] = useState(Boolean(config?.quick_sale_ask_quantity))
  const [askPrice, setAskPrice] = useState(Boolean(config?.quick_sale_ask_price))
  const [nfceMode, setNfceMode] = useState<NfceMode>(config?.quick_sale_nfce_mode ?? 'off')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (!config?.id) {
      setError('Configuração da empresa não encontrada.')
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateConfig(session.token.token, company.id, config.id, {
        quick_sale_enabled: enabled,
        quick_sale_only_mode: enabled ? onlyMode : false,
        quick_sale_ask_print_preview: askPreview,
        quick_sale_print_model: printModel,
        quick_sale_ask_quantity: askQuantity,
        quick_sale_ask_price: askPrice,
        quick_sale_nfce_mode: nfceMode,
      })
      onCompanyUpdate({ ...company, config: { ...config, ...updated } })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar as configurações.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-[var(--border)] text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-[18px] font-bold text-[var(--ink)]">Venda Rápida</h1>
          <p className="text-[12.5px] text-[var(--ink-soft)]">Configurações do modo de venda rápida no PDV</p>
        </div>
      </div>

      <div className="flex max-w-lg flex-col gap-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[var(--blue-100)] text-[var(--blue-700)]">
              <CoinIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13.5px] font-bold text-[var(--ink)]">Habilitar venda rápida</p>
              <p className="text-[11.5px] text-[var(--ink-soft)]">Libera a opção de venda rápida no PDV</p>
            </div>
          </div>
          <Toggle checked={enabled} onChange={setEnabled} />
        </div>

        {enabled && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div>
              <p className="text-[13.5px] font-bold text-[var(--ink)]">Somente venda rápida</p>
              <p className="text-[11.5px] text-[var(--ink-soft)]">
                Esconde as mesas/comandas — o PDV abre direto na venda rápida
              </p>
            </div>
            <Toggle checked={onlyMode} onChange={setOnlyMode} />
          </div>
        )}

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-[13.5px] font-bold text-[var(--ink)]">Perguntar a quantidade</p>
            <p className="text-[11.5px] text-[var(--ink-soft)]">
              Depois de bipar o produto, pede pra digitar a quantidade (padrão: 1)
            </p>
          </div>
          <Toggle checked={askQuantity} onChange={setAskQuantity} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-[13.5px] font-bold text-[var(--ink)]">Permitir alterar o preço na venda</p>
            <p className="text-[11.5px] text-[var(--ink-soft)]">
              Pede pra confirmar/digitar o preço de cada produto antes de adicionar — útil pra quem
              define o preço na hora
            </p>
          </div>
          <Toggle checked={askPrice} onChange={setAskPrice} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-[13.5px] font-bold text-[var(--ink)]">Perguntar antes de mostrar o preview</p>
            <p className="text-[11.5px] text-[var(--ink-soft)]">
              Desligado, o comprovante já aparece pronto pra imprimir ao finalizar
            </p>
          </div>
          <Toggle checked={askPreview} onChange={setAskPreview} />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3">
            <p className="text-[13.5px] font-bold text-[var(--ink)]">NFC-e na venda rápida</p>
            <p className="text-[11.5px] text-[var(--ink-soft)]">
              O que fazer com a NFC-e ao finalizar a venda. Usa a configuração de NFC-e do administrativo (Configurações
              → Fiscal) e segue o mesmo fluxo da NF-e.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: 'off', label: 'Não emitir' },
                { value: 'ask', label: 'Perguntar' },
                { value: 'always', label: 'Sempre emitir' },
              ] as { value: NfceMode; label: string }[]
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setNfceMode(option.value)}
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${
                  nfceMode === option.value
                    ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
                    : 'border-[var(--border)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {nfceMode !== 'off' && config?.nfe_module_enabled === false && (
            <p className="mt-2 text-[11.5px] font-medium text-[var(--red-500)]">
              O módulo de NFe não está ativo nessa empresa — ative no administrativo (Configurações → Fiscal), senão a
              NFC-e não será enviada.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[var(--blue-100)] text-[var(--blue-700)]">
              <PrinterIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13.5px] font-bold text-[var(--ink)]">Modelo de impressão</p>
              <p className="text-[11.5px] text-[var(--ink-soft)]">Formato padrão do comprovante</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPrintModel('thermal')}
              className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${
                printModel === 'thermal'
                  ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
                  : 'border-[var(--border)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
              }`}
            >
              Cupom Fiscal (térmica)
            </button>
            <button
              type="button"
              onClick={() => setPrintModel('a4')}
              className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${
                printModel === 'a4'
                  ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
                  : 'border-[var(--border)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
              }`}
            >
              Folha A4
            </button>
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-[var(--red-100)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-500)]">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-xl bg-[var(--blue-500)] py-3 text-[14px] font-bold text-white transition hover:bg-[var(--blue-700)] disabled:opacity-60"
        >
          {saved ? (
            <>
              <CheckCircleIcon className="h-4 w-4" /> Salvo
            </>
          ) : saving ? (
            'Salvando…'
          ) : (
            'Salvar'
          )}
        </button>
      </div>
    </div>
  )
}
