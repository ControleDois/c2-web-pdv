// Bip curto de confirmação (sem arquivo de áudio): agudo = deu certo, grave
// duplo = problema. Falha em silêncio se o navegador bloquear o áudio.
let context: AudioContext | null = null

function tone(frequency: number, start: number, duration: number) {
  if (!context) return
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(0.0001, context.currentTime + start)
  gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(context.currentTime + start)
  oscillator.stop(context.currentTime + start + duration + 0.02)
}

export function beep(kind: 'ok' | 'error') {
  try {
    context = context ?? new AudioContext()
    if (context.state === 'suspended') void context.resume()
    if (kind === 'ok') {
      tone(1200, 0, 0.12)
    } else {
      tone(220, 0, 0.18)
      tone(180, 0.22, 0.28)
    }
  } catch {
    // sem áudio: segue só com o aviso visual
  }
}
