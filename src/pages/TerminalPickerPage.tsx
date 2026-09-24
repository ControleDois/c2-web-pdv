import { WalletIcon, CheckCircleIcon } from '../components/icons'
import type { CompanyTerminalOption } from '../lib/terminal'

interface TerminalPickerPageProps {
  terminals: CompanyTerminalOption[]
  onSelect: (terminal: CompanyTerminalOption) => void
  onSkip: () => void
}

// Aparece uma vez por navegador/empresa (fica salvo depois) quando a empresa
// tem terminais cadastrados - o operador escolhe qual caixa/balcão é esse
// computador antes de entrar no PDV.
export function TerminalPickerPage({ terminals, onSelect, onSkip }: TerminalPickerPageProps) {
  return (
    <div className="flex h-svh flex-col items-center justify-center bg-[var(--page)] p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--blue-100)] text-[var(--blue-700)]">
            <WalletIcon className="h-5 w-5" />
          </span>
          <h1 className="mt-3 text-[17px] font-bold text-[var(--ink)]">Qual terminal é este?</h1>
          <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">
            A escolha fica salva neste computador - pode trocar depois em Ajustes.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {terminals.map((terminal) => (
            <button
              key={terminal.id}
              type="button"
              onClick={() => onSelect(terminal)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-left transition hover:border-[var(--blue-300)]"
            >
              <div>
                <p className="text-[14px] font-bold text-[var(--ink)]">{terminal.name}</p>
                <p className="mt-0.5 text-[11.5px] text-[var(--ink-soft)]">
                  {terminal.hasApiUrl ? 'Servidor local próprio' : 'Servidor padrão'}
                </p>
              </div>
              <CheckCircleIcon className="h-4 w-4 flex-none text-[var(--muted)]" />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onSkip}
          className="mt-4 w-full rounded-xl py-2.5 text-center text-[12.5px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          Continuar sem escolher um terminal
        </button>
      </div>
    </div>
  )
}
