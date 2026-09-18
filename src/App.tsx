import { useState, type ReactNode } from 'react'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { CompanySelectionPage } from './pages/CompanySelectionPage'
import { PdvPage } from './pages/PdvPage'
import { ThemeToggle } from './components/ThemeToggle'
import { Logo } from './components/Logo'
import { LogoutIcon, BuildingsIcon } from './components/icons'
import {
  loadSession,
  saveSession,
  clearSession,
  loadActiveCompany,
  saveActiveCompany,
  clearActiveCompany,
  getUserCompanies,
  fetchMyCompanies,
  getCompanyName,
  type AuthSession,
  type AuthCompany,
} from './lib/auth'

type Screen = 'login' | 'forgot-password'

function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession())
  const [activeCompany, setActiveCompany] = useState<AuthCompany | null>(() => loadActiveCompany())
  const [screen, setScreen] = useState<Screen>('login')
  const [switchingCompany, setSwitchingCompany] = useState(false)

  function handleLoginSuccess(newSession: AuthSession) {
    saveSession(newSession)
    setSession(newSession)

    const companies = getUserCompanies(newSession)
    if (companies.length === 1) {
      saveActiveCompany(companies[0])
      setActiveCompany(companies[0])
    }
  }

  function handleSelectCompany(company: AuthCompany) {
    saveActiveCompany(company)
    setActiveCompany(company)
  }

  // Usado quando uma tela (ex: Ajustes > Venda Rápida) atualiza a Config da
  // empresa ativa - reflete na hora, sem precisar trocar de empresa ou logar
  // de novo pra pegar o valor novo.
  function handleCompanyUpdate(company: AuthCompany) {
    saveActiveCompany(company)
    setActiveCompany(company)
  }

  async function handleSwitchCompany() {
    clearActiveCompany()
    setActiveCompany(null)

    if (!session) return

    setSwitchingCompany(true)
    try {
      const { companies } = await fetchMyCompanies(session.token.token)
      const updatedSession: AuthSession = { ...session, user: { ...session.user, companies } }
      saveSession(updatedSession)
      setSession(updatedSession)

      if (companies.length === 1) {
        handleSelectCompany(companies[0])
      }
    } catch {
      // Se a atualização falhar, segue com a lista antiga (já em sessão) em
      // vez de travar a troca de empresa.
    } finally {
      setSwitchingCompany(false)
    }
  }

  function handleLogout() {
    clearSession()
    setSession(null)
    setActiveCompany(null)
    setScreen('login')
  }

  let content: ReactNode

  if (session && switchingCompany) {
    content = (
      <div className="flex h-svh items-center justify-center bg-[var(--page)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--blue-300)] border-t-[var(--blue-500)]" />
      </div>
    )
  } else if (session && activeCompany) {
    content = (
      <div className="flex h-svh flex-col bg-[var(--page)]">
        <header className="flex flex-none items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-6" />
            <span className="text-[13px] font-bold text-[var(--ink)]">PDV</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSwitchCompany}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--ink-soft)] hover:bg-[var(--page)] hover:text-[var(--ink)]"
            >
              <BuildingsIcon className="h-3.5 w-3.5" />
              {getCompanyName(activeCompany)}
            </button>
            <ThemeToggle variant="inline" />
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--red-500)] hover:bg-[var(--red-100)]"
            >
              <LogoutIcon className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1">
          <PdvPage session={session} company={activeCompany} onCompanyUpdate={handleCompanyUpdate} />
        </main>
      </div>
    )
  } else if (session) {
    content = (
      <CompanySelectionPage
        session={session}
        companies={getUserCompanies(session)}
        onSelect={handleSelectCompany}
        onLogout={handleLogout}
      />
    )
  } else if (screen === 'forgot-password') {
    content = <ForgotPasswordPage onBackToLogin={() => setScreen('login')} />
  } else {
    content = (
      <LoginPage onForgotPassword={() => setScreen('forgot-password')} onLoginSuccess={handleLoginSuccess} />
    )
  }

  const showFloatingThemeToggle = !(session && activeCompany)

  return (
    <>
      {content}
      {showFloatingThemeToggle && <ThemeToggle />}
    </>
  )
}

export default App
