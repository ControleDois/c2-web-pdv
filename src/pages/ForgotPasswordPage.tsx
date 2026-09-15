import { useState, type FormEvent } from 'react'
import { Logo } from '../components/Logo'
import { LegalFooter } from '../components/LegalFooter'
import { TextField } from '../components/form/TextField'
import { MailIcon, CheckCircleIcon, ChevronLeftIcon } from '../components/icons'

interface ForgotPasswordPageProps {
  onBackToLogin: () => void
}

export function ForgotPasswordPage({ onBackToLogin }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!email) {
      setError('Informe seu e-mail para continuar.')
      return
    }

    setSubmitting(true)
    await new Promise((resolve) => setTimeout(resolve, 900))
    setSubmitting(false)
    setSent(true)
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
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">Recuperar acesso à sua conta</p>
          </div>
        </div>

        <div className="rounded-[28px] bg-[var(--surface)] p-8 shadow-[var(--card-shadow)]">
          {sent ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--green-100)] text-[var(--green-600)]">
                <CheckCircleIcon className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-[18px] font-bold tracking-tight text-[var(--ink)]">Verifique seu e-mail</h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-soft)]">
                  Se <span className="font-semibold text-[var(--ink)]">{email}</span> estiver cadastrado, você vai
                  receber em alguns minutos um link para redefinir sua senha.
                </p>
              </div>

              <button
                type="button"
                onClick={onBackToLogin}
                className="mt-2 w-full rounded-xl bg-[var(--blue-500)] py-3 text-[14px] font-bold text-white transition hover:bg-[var(--blue-700)]"
              >
                Voltar para o login
              </button>

              <button
                type="button"
                onClick={() => setSent(false)}
                className="text-[12.5px] font-semibold text-[var(--blue-700)] hover:underline"
              >
                Não recebeu? Tentar de novo
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div>
                <h2 className="text-[20px] font-bold tracking-tight text-[var(--ink)]">Esqueci minha senha</h2>
                <p className="mt-1 text-[13px] text-[var(--ink-soft)]">
                  Informe o e-mail cadastrado e enviaremos um link para redefinir sua senha.
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

              {error && (
                <p className="rounded-lg bg-[var(--red-100)] px-3 py-2 text-[13px] font-medium text-[var(--red-500)]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-[var(--blue-500)] py-3 text-[14px] font-bold text-white transition hover:bg-[var(--blue-700)] disabled:opacity-60"
              >
                {submitting ? 'Enviando…' : 'Enviar link de recuperação'}
              </button>

              <button
                type="button"
                onClick={onBackToLogin}
                className="flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" />
                Voltar para o login
              </button>
            </form>
          )}
        </div>

        <LegalFooter />
      </div>
    </div>
  )
}
