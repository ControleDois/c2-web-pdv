import { useEffect, useRef, type ReactNode } from 'react'

interface DirectPrintProps {
  // Cópia de impressão (QuickSalePrintPortal / NfcePrintPortal), montada no <body>.
  children: ReactNode
  onDone: () => void
}

// Impressão direta: monta a cópia de impressão, espera as imagens (QR-code) e
// chama a impressão do navegador na hora, sem mostrar preview. Com o Chrome do
// caixa aberto com --kiosk-printing, a impressão sai sozinha na impressora
// padrão; sem isso, o navegador mostra o diálogo de impressão normal.
export function DirectPrint({ children, onDone }: DirectPrintProps) {
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      done.current()
    }

    const timer = setTimeout(async () => {
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('#pdv-print-root img'))
      await Promise.all(
        images.map((image) =>
          image.complete
            ? null
            : new Promise<void>((resolve) => {
                image.onload = image.onerror = () => resolve()
                setTimeout(resolve, 3000)
              })
        )
      )
      window.addEventListener('afterprint', finish, { once: true })
      window.print()
      // Alguns navegadores não disparam afterprint: segue mesmo assim.
      setTimeout(finish, 4000)
    }, 350)

    return () => {
      clearTimeout(timer)
      finished = true
    }
  }, [])

  return <>{children}</>
}
