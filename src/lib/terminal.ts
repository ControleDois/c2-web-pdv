import { apiGet } from './api'

// Terminal (PDV) que o operador escolhe ao entrar - quando ele tem um
// servidor local próprio configurado (c2-delphi-server na máquina/rede do
// caixa), a emissão de NF-e/NFC-e passa a usar esse link em vez do servidor
// padrão da empresa. Cadastro completo fica no administrativo
// (Configurações → Terminais); aqui só os campos que o PDV precisa pra
// deixar o operador escolher.
export interface CompanyTerminalOption {
  id: string
  code?: number
  name: string
  hasApiUrl: boolean
  nfeActive: boolean
  nfceActive: boolean
}

export function fetchCompanyTerminals(token: string, companyId: string) {
  return apiGet<CompanyTerminalOption[]>('/company-terminal', { companyId }, token)
}

const STORAGE_PREFIX = 'c2_pdv_terminal_'

// Guardado por empresa (não por usuário) - o terminal é o computador/caixa
// físico, então a escolha fica no navegador daquela máquina.
export function loadSelectedTerminalId(companyId: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + companyId)
  } catch {
    return null
  }
}

export function saveSelectedTerminalId(companyId: string, terminalId: string | null) {
  try {
    if (terminalId) {
      localStorage.setItem(STORAGE_PREFIX + companyId, terminalId)
    } else {
      localStorage.removeItem(STORAGE_PREFIX + companyId)
    }
  } catch {
    // localStorage indisponível (aba anônima etc) - segue sem persistir, só
    // pede de novo na próxima vez que o PDV abrir.
  }
}
