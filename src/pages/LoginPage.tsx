import { useState, type FormEvent } from 'react'
import { Logo } from '../components/Logo'
import { LegalFooter } from '../components/LegalFooter'
import { TextField } from '../components/form/TextField'
import { PasswordField } from '../components/form/PasswordField'
import { MailIcon } from '../components/icons'
import { signin, type AuthSession } from '../lib/auth'
import { ApiError } from '../lib/api'

interface LoginPageProps {
  onForgotPassword: () => void
  onLoginSuccess: (session: AuthSession) => void
}

export function LoginPage({ onForgotPassword, onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Preencha e-mail e senha para continuar.')
      return
    }

    setSubmitting(true)
    try {
      const session = await signin(email, password)
      onLoginSuccess(session)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[var(--page)] px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--blue-100), transparent 70%)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-16 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--green-100), transparent 70%)' }}
      />

      <div className="relative w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="h-20 w-20" />
          <div>
            <h1 className="text-[17px] font-bold tracking-tight text-[var(--ink)]">Controle Dois</h1>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">Acesse o painel da sua empresa</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-[28px] bg-[var(--surface)] p-8 shadow-[var(--card-shadow)]"
        >
          <div>
            <h2 className="text-[20px] font-bold tracking-tight text-[var(--ink)]">Entrar</h2>
            <p className="mt-1 text-[13px] text-[var(--ink-soft)]">
              Bem-vindo de volta. Informe seus dados para continuar.
            </p>
          </div>

          <TextField
            label="E-mail"
            icon={<MailIcon className="h-4 w-4" />}
            type="email"
            placeholder="voce@suaempresa.com.br"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <PasswordField
            label="Senha"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            action={
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-[12px] font-semibold text-[var(--blue-700)] hover:underline"
              >
                Esqueci minha senha
              </button>
            }
          />

          {error && (
            <p className="rounded-lg bg-[var(--red-100)] px-3 py-2 text-[13px] font-medium text-[var(--red-500)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-xl bg-[var(--blue-500)] py-3 text-[14px] font-bold text-white transition hover:bg-[var(--blue-700)] disabled:opacity-60"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>

        </form>

        <LegalFooter />
      </div>
    </div>
  )
}
