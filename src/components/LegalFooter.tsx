import { formatCnpj } from '../lib/formatCnpj'

const SUPPORT_PHONE_DISPLAY = '(65) 99281-9663'
const SUPPORT_WHATSAPP_URL =
  'https://wa.me/5565992819663?text=Ol%C3%A1%2C%20gostaria%20de%20ajuda%20com%20o%20Controle%20Dois'
const COMPANY_CNPJ = formatCnpj('44474487000110')

export function LegalFooter() {
  return (
    <div className="mt-8 border-t border-[var(--border)] pt-5">
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center text-[11px] font-semibold tracking-[0.08em] text-[var(--muted)] uppercase">
        <span>© {new Date().getFullYear()} Controle Dois</span>
        <span aria-hidden="true">·</span>
        <span>CNPJ {COMPANY_CNPJ}</span>
        <span aria-hidden="true">·</span>
        <a
          href="https://controledois.com.br/termos-de-uso"
          target="_blank"
          rel="noreferrer"
          className="hover:text-[var(--ink-soft)] hover:underline"
        >
          Termos
        </a>
        <span aria-hidden="true">·</span>
        <a
          href="https://controledois.com.br/politica-de-privacidade"
          target="_blank"
          rel="noreferrer"
          className="hover:text-[var(--ink-soft)] hover:underline"
        >
          Privacidade
        </a>
        <span aria-hidden="true">·</span>
        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-[var(--ink-soft)] hover:underline"
        >
          Suporte: {SUPPORT_PHONE_DISPLAY}
        </a>
      </p>
    </div>
  )
}
