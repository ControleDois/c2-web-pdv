import { Select } from '../components/form/Select'
import { useEffect, useState } from 'react'
import { updateConfig } from '../lib/config'
import { fetchActivePrinters, type PrinterOption } from '../lib/printing'
import { ApiError } from '../lib/api'
import type { NfceMode } from '../lib/nfce'
import { parseScaleLabel, scaleFormatLength, type ScaleConfig } from '../lib/scale'
import { formatCurrency, formatQuantity } from '../lib/format'
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
  const [receiptPrinterId, setReceiptPrinterId] = useState(config?.quick_sale_receipt_printer_id ?? '')
  const [nfcePrinterId, setNfcePrinterId] = useState(config?.quick_sale_nfce_printer_id ?? '')
  const [printers, setPrinters] = useState<PrinterOption[]>([])
  const [printModel, setPrintModel] = useState<'thermal' | 'a4'>(config?.quick_sale_print_model ?? 'thermal')
  const [askQuantity, setAskQuantity] = useState(Boolean(config?.quick_sale_ask_quantity))
  const [askPrice, setAskPrice] = useState(Boolean(config?.quick_sale_ask_price))
  const [nfceMode, setNfceMode] = useState<NfceMode>(config?.quick_sale_nfce_mode ?? 'off')
  const [nfseMode, setNfseMode] = useState<NfceMode>(config?.quick_sale_nfse_mode ?? 'off')
  const [scaleEnabled, setScaleEnabled] = useState(Boolean(config?.scale_enabled))
  const [scalePrefix, setScalePrefix] = useState(String(config?.scale_prefix ?? '2'))
  const [scaleCodeDigits, setScaleCodeDigits] = useState(Number(config?.scale_code_digits ?? 6))
  const [scaleValueDigits, setScaleValueDigits] = useState(Number(config?.scale_value_digits ?? 5))
  const [scaleValueType, setScaleValueType] = useState<'price' | 'weight'>(config?.scale_value_type ?? 'price')
  const [scaleSample, setScaleSample] = useState('')
  const [tokensEnabled, setTokensEnabled] = useState(config?.sale_tokens_enabled !== false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchActivePrinters(session.token.token, company.id)
      .then(setPrinters)
      .catch(() => setPrinters([]))
  }, [session.token.token, company.id])

  const scaleDraft: ScaleConfig = {
    enabled: true,
    prefix: scalePrefix,
    codeDigits: scaleCodeDigits,
    valueDigits: scaleValueDigits,
    valueType: scaleValueType,
  }
  const scaleLength = scaleFormatLength(scaleDraft)
  const scaleFormatValid = scalePrefix.length > 0 && scaleLength === 13
  const scaleParsed = scaleSample.trim() ? parseScaleLabel(scaleSample, scaleDraft) : null

  async function handleSave() {
    if (scaleEnabled && !scaleFormatValid) {
      setError('O formato da etiqueta da balança precisa somar 13 dígitos (prefixo + código + valor + 1 dígito verificador).')
      return
    }
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
        quick_sale_receipt_printer_id: receiptPrinterId || null,
        quick_sale_nfce_printer_id: nfcePrinterId || null,
        quick_sale_print_model: printModel,
        quick_sale_ask_quantity: askQuantity,
        quick_sale_ask_price: askPrice,
        quick_sale_nfce_mode: nfceMode,
        quick_sale_nfse_mode: nfseMode,
        scale_enabled: scaleEnabled,
        scale_prefix: scalePrefix,
        scale_code_digits: scaleCodeDigits,
        scale_value_digits: scaleValueDigits,
        scale_value_type: scaleValueType,
        sale_tokens_enabled: tokensEnabled,
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

        {enabled && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div>
              <p className="text-[13.5px] font-bold text-[var(--ink)]">Fichas</p>
              <p className="text-[11.5px] text-[var(--ink-soft)]">
                Mostra o menu Fichas e pergunta se imprime as fichas ao finalizar a venda (produtos marcados para gerar ficha)
              </p>
            </div>
            <Toggle checked={tokensEnabled} onChange={setTokensEnabled} />
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
            <p className="text-[13.5px] font-bold text-[var(--ink)]">Impressoras (impressão direta)</p>
            <p className="text-[11.5px] text-[var(--ink-soft)]">
              Impressoras padrão da empresa, usadas quando o PDV não está em um terminal. Quando o PDV está em um terminal,
              valem as impressoras dele (administrativo → Configurações → Terminais). Sem impressora, o PDV mostra a
              pré-visualização. As impressoras são cadastradas no administrativo (menu do usuário → Adicionais → Impressoras).
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {[
              { label: 'Impressora padrão do comprovante e das fichas', value: receiptPrinterId, set: setReceiptPrinterId },
              { label: 'Impressora padrão da NFC-e', value: nfcePrinterId, set: setNfcePrinterId },
            ].map((field) => (
              <label key={field.label} className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-[var(--ink-soft)]">{field.label}</span>
                <Select value={field.value} onChange={field.set} allowEmpty>
                  <option value="">Mostrar preview (sem impressora)</option>
                  {printers.map((printer) => (
                    <option key={printer.id} value={printer.id}>
                      {printer.name} — {printer.path}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          {printers.length === 0 && (
            <p className="mt-2 text-[11.5px] text-[var(--muted)]">
              Nenhuma impressora cadastrada ainda. Cadastre no administrativo, em menu do usuário → Adicionais → Impressoras.
            </p>
          )}
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
          <div className="mb-3">
            <p className="text-[13.5px] font-bold text-[var(--ink)]">NFS-e (nota de serviço) na venda rápida</p>
            <p className="text-[11.5px] text-[var(--ink-soft)]">
              O que fazer com a nota de serviço ao finalizar uma venda que tem serviço (produto cadastrado como
              Serviço). Só os serviços entram na nota. Usa a configuração de NFS-e do administrativo.
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
                onClick={() => setNfseMode(option.value)}
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${
                  nfseMode === option.value
                    ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
                    : 'border-[var(--border)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {nfseMode !== 'off' && config?.nfse_module_enabled === false && (
            <p className="mt-2 text-[11.5px] font-medium text-[var(--red-500)]">
              O módulo de NFS-e não está ativo nessa empresa — ative no administrativo (Configurações → Fiscal), senão a
              nota de serviço não será enviada.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[13.5px] font-bold text-[var(--ink)]">Balança etiquetadora</p>
              <p className="text-[11.5px] text-[var(--ink-soft)]">
                Lê a etiqueta impressa pela balança (ex.: Toledo Prix 4 Plus) e lança o produto com o peso e o valor exatos
                da etiqueta. No cadastro do produto, coloque o código do item da balança no campo código de barras (ex.: 300).
              </p>
            </div>
            <Toggle checked={scaleEnabled} onChange={setScaleEnabled} />
          </div>

          {scaleEnabled && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Prefixo</span>
                  <input
                    value={scalePrefix}
                    inputMode="numeric"
                    onChange={(event) => setScalePrefix(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--blue-300)]"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Dígitos do código</span>
                  <input
                    value={scaleCodeDigits}
                    inputMode="numeric"
                    onChange={(event) => setScaleCodeDigits(Math.min(9, Number(event.target.value.replace(/\D/g, '')) || 0))}
                    className="rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--blue-300)]"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Dígitos do valor</span>
                  <input
                    value={scaleValueDigits}
                    inputMode="numeric"
                    onChange={(event) => setScaleValueDigits(Math.min(9, Number(event.target.value.replace(/\D/g, '')) || 0))}
                    className="rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--blue-300)]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'price', label: 'A etiqueta traz o valor (R$)' },
                    { value: 'weight', label: 'A etiqueta traz o peso (g)' },
                  ] as { value: 'price' | 'weight'; label: string }[]
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setScaleValueType(option.value)}
                    className={`rounded-xl border px-3 py-2.5 text-[12.5px] font-semibold transition ${
                      scaleValueType === option.value
                        ? 'border-[var(--blue-500)] bg-[var(--blue-100)] text-[var(--blue-700)]'
                        : 'border-[var(--border)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <p className={`text-[11.5px] ${scaleFormatValid ? 'text-[var(--ink-soft)]' : 'font-medium text-[var(--red-500)]'}`}>
                Formato: {scalePrefix || '?'} + {scaleCodeDigits} (código) + {scaleValueDigits} (
                {scaleValueType === 'price' ? 'valor em centavos' : 'peso em gramas'}) + 1 (verificador) = {scaleLength} dígitos
                {scaleFormatValid ? '.' : ' — precisa dar 13.'}
              </p>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Testar uma etiqueta (bipe ou digite)</span>
                <input
                  value={scaleSample}
                  inputMode="numeric"
                  placeholder="2000123012345"
                  onChange={(event) => setScaleSample(event.target.value.replace(/\D/g, '').slice(0, 13))}
                  className="rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--blue-300)]"
                />
              </label>
              {scaleSample.trim() && (
                <p className="rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[12.5px] text-[var(--ink)]">
                  {scaleParsed
                    ? `Código do item: ${scaleParsed.code} · ${
                        scaleValueType === 'price'
                          ? `valor ${formatCurrency(scaleParsed.value)}`
                          : `peso ${formatQuantity(scaleParsed.value)} kg`
                      }`
                    : 'Não reconheci essa etiqueta com o formato acima. Ajuste o prefixo e os dígitos.'}
                </p>
              )}
            </div>
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
