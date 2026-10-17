import { useEffect, useRef, useState } from 'react'
import { CloseIcon } from '../icons'

export type ScanFeedback = { status: 'added' | 'not-found' | 'needs-input'; label: string }

interface BarcodeScannerModalProps {
  // Chamado a cada código lido; devolve o que aconteceu para a tela mostrar.
  onDetected: (code: string) => Promise<ScanFeedback>
  onClose: () => void
}

interface NativeDetector {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>
}

const SAME_CODE_PAUSE_MS = 2500

// Leitura de código de barras pela câmera do celular: usa o leitor do próprio navegador (Android)
// e, onde não existe (iPhone), a biblioteca ZXing carregada só quando a câmera é aberta.
export function BarcodeScannerModal({ onDetected, onClose }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const detectedRef = useRef(onDetected)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)

  useEffect(() => {
    detectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    let stopZxing: (() => void) | null = null
    let busy = false
    let lastCode = ''
    let lastAt = 0
    let clearFeedback: ReturnType<typeof setTimeout> | null = null

    async function handle(code: string) {
      const now = Date.now()
      if (busy || (code === lastCode && now - lastAt < SAME_CODE_PAUSE_MS)) return
      busy = true
      lastCode = code
      lastAt = now
      navigator.vibrate?.(60)
      try {
        const result = await detectedRef.current(code)
        if (stopped) return
        setFeedback(result)
        if (clearFeedback) clearTimeout(clearFeedback)
        clearFeedback = setTimeout(() => setFeedback(null), 2200)
      } finally {
        busy = false
      }
    }

    async function start() {
      const video = videoRef.current
      if (!video) return
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador não permite usar a câmera. Abra o PDV em https.')
        return
      }
      const constraints: MediaStreamConstraints = { video: { facingMode: { ideal: 'environment' } }, audio: false }
      try {
        const Detector = (window as unknown as { BarcodeDetector?: new (options?: object) => NativeDetector }).BarcodeDetector
        if (Detector) {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
          if (stopped) return stream.getTracks().forEach((track) => track.stop())
          video.srcObject = stream
          await video.play().catch(() => undefined)
          const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'] })
          timer = setInterval(async () => {
            if (video.readyState < 2) return
            try {
              const codes = await detector.detect(video)
              if (codes[0]?.rawValue) void handle(codes[0].rawValue)
            } catch {
              // quadro sem código: tenta no próximo
            }
          }, 200)
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          if (stopped) return
          const reader = new BrowserMultiFormatReader()
          const controls = await reader.decodeFromConstraints(constraints, video, (result) => {
            if (result) void handle(result.getText())
          })
          if (stopped) controls.stop()
          else stopZxing = () => controls.stop()
        }
      } catch (err) {
        const name = err instanceof Error ? err.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'A câmera está bloqueada. Permita o uso da câmera nas configurações do navegador e abra de novo.'
            : 'Não foi possível abrir a câmera.'
        )
      }
    }

    void start()
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      if (clearFeedback) clearTimeout(clearFeedback)
      stopZxing?.()
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const tone =
    feedback?.status === 'added'
      ? 'bg-[var(--green-600)] text-white'
      : feedback?.status === 'not-found'
        ? 'bg-[var(--red-500)] text-white'
        : 'bg-[var(--blue-500)] text-white'

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black">
      <div className="flex flex-none items-center justify-between px-4 py-3 text-white">
        <p className="text-[14px] font-bold">Aponte para o código de barras</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar câmera"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-[78%] max-w-sm rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {feedback && (
          <div className={`absolute inset-x-4 bottom-6 rounded-2xl px-4 py-3 text-center text-[14px] font-bold shadow-xl ${tone}`}>
            {feedback.label}
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="rounded-2xl bg-[var(--surface)] p-5 text-center text-[14px] font-semibold text-[var(--ink)]">{error}</p>
          </div>
        )}
      </div>

      <div className="flex-none px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onClose} className="w-full rounded-2xl bg-white py-3.5 text-[15px] font-bold text-black">
          Concluir
        </button>
      </div>
    </div>
  )
}
