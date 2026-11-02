export interface CepAddress {
  zip_code: string
  address: string
  district: string
  city: string
  state: string
  code_ibge: string
}

// ViaCEP direto do navegador: já traz o código IBGE do município, que a NFS-e exige.
export async function lookupCep(raw: string): Promise<CepAddress | null> {
  const zip = raw.replace(/\D/g, '')
  if (zip.length !== 8) return null
  try {
    const response = await fetch(`https://viacep.com.br/ws/${zip}/json/`)
    if (!response.ok) return null
    const data = await response.json()
    if (data?.erro) return null
    return {
      zip_code: zip,
      address: data.logradouro || '',
      district: data.bairro || '',
      city: data.localidade || '',
      state: data.uf || '',
      code_ibge: String(data.ibge || ''),
    }
  } catch {
    return null
  }
}
