import { useTheme } from '../hooks/useTheme'
import { SunIcon, MoonIcon } from './icons'

interface ThemeToggleProps {
  variant?: 'floating' | 'inline'
}

export function ThemeToggle({ variant = 'floating' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()

  const className =
    variant === 'floating'
      ? 'fixed top-1/2 right-5 z-50 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-soft)] shadow-[var(--card-shadow)] ring-1 ring-[var(--border)] transition hover:text-[var(--ink)]'
      : 'flex h-9 w-9 flex-none items-center justify-center rounded-full text-[var(--ink-soft)] transition hover:bg-[var(--page)] hover:text-[var(--ink)]'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
      className={className}
    >
      {theme === 'dark' ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
    </button>
  )
}
