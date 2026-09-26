import { midiToFreq } from './music'

let ctx: AudioContext | null = null
let unlocked = false
let silentEl: HTMLAudioElement | null = null

/** Near-silent 1ms WAV — HTML5 playback routes iOS audio past the mute switch. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

function getContext() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
  }
  return ctx
}

/**
 * Unlock mobile (esp. iOS) audio so Web Audio tones play in silent mode.
 * Fully non-blocking — never returns a Promise. Safe (and required) to call
 * synchronously from click/touch handlers; do not `await` this.
 */
export function unlockMobileAudio() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return

  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) {
      try {
        session.type = 'playback'
      } catch {
        // Unsupported assignment — ignore
      }
    }
  } catch {
    // ignore
  }

  if (!unlocked) {
    if (!silentEl) {
      silentEl = new Audio(SILENT_WAV)
      silentEl.setAttribute('playsinline', '')
      silentEl.setAttribute('webkit-playsinline', '')
      silentEl.volume = 0.01
    }

    try {
      silentEl.currentTime = 0
    } catch {
      // ignore seek errors
    }

    // Kick off playback inside the user gesture; never await — rejections must
    // not stall React event handlers. Retry on the next gesture if this fails.
    void silentEl.play().then(
      () => {
        try {
          silentEl?.pause()
        } catch {
          // ignore
        }
        unlocked = true
      },
      () => {},
    )
  }

  const audio = getContext()
  if (audio?.state === 'suspended') {
    void audio.resume().catch(() => {})
  }
}

function ensureContext() {
  unlockMobileAudio()
  return getContext()
}

const PARTIALS: [number, number][] = [
  [1, 1],
  [2, 0.45],
  [3, 0.22],
  [4, 0.1],
  [5, 0.05],
]

export function playNote(midi: number, duration = 1.8, delay = 0) {
  const audio = ensureContext()
  if (!audio) return
  const start = audio.currentTime + delay + 0.02
  const freq = midiToFreq(midi)

  const master = audio.createGain()
  master.gain.setValueAtTime(0.0001, start)
  master.gain.exponentialRampToValueAtTime(0.28, start + 0.012)
  master.gain.exponentialRampToValueAtTime(0.12, start + 0.35)
  master.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(Math.min(freq * 8, 9000), start)
  filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 2, 400), start + duration)

  master.connect(filter).connect(audio.destination)

  for (const [ratio, amp] of PARTIALS) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq * ratio
    gain.gain.value = amp / PARTIALS.length
    osc.connect(gain).connect(master)
    osc.start(start)
    osc.stop(start + duration + 0.05)
  }
}

export function playSequence(midis: number[], gap = 0.9) {
  unlockMobileAudio()
  midis.forEach((m, i) => playNote(m, 1.4, i * gap))
}
