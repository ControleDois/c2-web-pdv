import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { TextField } from './TextField'
import { LockIcon, EyeIcon, EyeOffIcon } from '../icons'

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  action?: ReactNode
}

export function PasswordField({ label, action, ...inputProps }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <TextField
      {...inputProps}
      label={label}
      action={action}
      icon={<LockIcon className="h-4 w-4" />}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="flex-none text-[var(--muted)] hover:text-[var(--ink-soft)]"
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {visible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </button>
      }
    />
  )
}
