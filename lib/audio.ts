import { midiToFreq } from './music'

let ctx: AudioContext | null = null

function getContext() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

const PARTIALS: [number, number][] = [
  [1, 1],
  [2, 0.45],
  [3, 0.22],
  [4, 0.1],
  [5, 0.05],
]

export function playNote(midi: number, duration = 1.8, delay = 0) {
  const audio = getContext()
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
  midis.forEach((m, i) => playNote(m, 1.4, i * gap))
}
