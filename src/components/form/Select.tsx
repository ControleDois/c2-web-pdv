import { Children, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon } from '../icons'

interface SelectProps {
  value: string | number
  onChange: (value: string) => void
  children: ReactNode
  placeholder?: string
  // true: a opção de valor vazio (ex.: "Sem impressora") é uma escolha de verdade; false: vira só o texto de "Selecione".
  allowEmpty?: boolean
  disabled?: boolean
  className?: string
}

interface Option {
  value: string
  label: ReactNode
  disabled?: boolean
}

function parseOptions(children: ReactNode): Option[] {
  const options: Option[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: unknown; disabled?: boolean; children?: ReactNode }>(child)) return
    options.push({ value: String(child.props.value ?? ''), label: child.props.children, disabled: child.props.disabled })
  })
  return options
}

// Lista de escolha própria (o <select> do navegador é fino e fora do padrão do sistema).
// Aceita <option> como filhos, igual ao select nativo, e funciona pelo teclado
// (setas, Enter e Esc) para o PDV continuar rápido. A lista abre sobre qualquer modal.
export function Select({ value, onChange, children, placeholder = 'Selecione', allowEmpty = false, disabled, className = '' }: SelectProps) {
  const options = useMemo(() => parseOptions(children), [children])
  const stringValue = String(value)
  const selected = options.find((option) => option.value === stringValue && (allowEmpty || option.value !== ''))
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null)
  const choices = allowEmpty ? options : options.filter((option) => option.value !== '')

  function openList() {
    if (disabled) return
    const index = choices.findIndex((option) => option.value === stringValue)
    setActive(index >= 0 ? index : 0)
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const openUp = below < 200 && above > below
    setPosition({
      left: rect.left,
      width: rect.width,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      maxHeight: Math.max(160, Math.min(320, openUp ? above : below)),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleDown(event: MouseEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, position])

  function pick(option: Option) {
    if (option.disabled) return
    onChange(option.value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        openList()
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => Math.min(current + 1, choices.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      if (choices[active]) pick(choices[active])
    }
  }

  return (
    <div className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        className="flex min-h-[46px] w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--page)] px-3.5 py-2.5 text-left text-[14px] text-[var(--ink)] transition hover:border-[var(--blue-300)] focus:border-[var(--blue-500)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? 'font-medium' : 'text-[var(--muted)]'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDownIcon className={`h-4 w-4 flex-none text-[var(--muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{ position: 'fixed', left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}
            className="z-[100] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl"
          >
            {choices.length === 0 && <p className="px-3 py-3 text-[13px] text-[var(--muted)]">Nenhuma opção.</p>}
            {choices.map((option, index) => {
              const isSelected = option.value === stringValue
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  disabled={option.disabled}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(option)}
                  className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[14px] transition disabled:opacity-50 ${
                    index === active ? 'bg-[var(--blue-100)]' : ''
                  } ${isSelected ? 'font-bold text-[var(--blue-700)]' : 'font-medium text-[var(--ink)]'}`}
                >
                  <span className="min-w-0 flex-1 whitespace-normal break-words">{option.label}</span>
                  {isSelected && <span className="flex-none text-[13px] text-[var(--blue-700)]">✓</span>}
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </div>
  )
}
