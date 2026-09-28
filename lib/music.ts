export type Mode = 'major' | 'minor'
export type SongKey = { tonic: number; mode: Mode }
export type VocalRange = { low: number; high: number }

export const MIN_MIDI = 33
export const MAX_MIDI = 91

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

export { MAJOR_NAMES, MINOR_NAMES }

const pc = (n: number) => ((n % 12) + 12) % 12

export function midiToName(midi: number) {
  return `${NOTE_NAMES[pc(midi)]}${Math.floor(midi / 12) - 1}`
}

export function midiToFreq(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12)
}

export function keyName(key: SongKey) {
  return key.mode === 'major' ? MAJOR_NAMES[pc(key.tonic)] : `${MINOR_NAMES[pc(key.tonic)]}m`
}

/** Human-readable label like "F# minor" / "G major" (never "F#m minor"). */
export function formatKeyLabel(key: SongKey) {
  const name = key.mode === 'major' ? MAJOR_NAMES[pc(key.tonic)] : MINOR_NAMES[pc(key.tonic)]
  return `${name} ${key.mode}`
}

const NOTE_TO_TONIC: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
}

/** Parse API / human key labels like "Bm", "G Major", "F#m", "Db major". */
export function parseKey(raw: string): SongKey | null {
  const cleaned = raw
    .trim()
    .replace(/[♯]/g, '#')
    .replace(/[♭]/g, 'b')
    .replace(/\s+/g, ' ')
  if (!cleaned) return null

  const match = cleaned.match(/^([A-Ga-g](?:#|b)?)\s*(?:[-–]?\s*)?(maj(?:or)?|min(?:or)?|m)?$/i)
  if (!match) return null

  const note = match[1][0].toUpperCase() + match[1].slice(1)
  const tonic = NOTE_TO_TONIC[note]
  if (tonic === undefined) return null

  const modeToken = (match[2] ?? '').toLowerCase()
  const mode: Mode = modeToken.startsWith('min') || modeToken === 'm' ? 'minor' : 'major'
  return { tonic, mode }
}

function chordName(root: number, quality: 'maj' | 'min') {
  return quality === 'maj' ? MAJOR_NAMES[pc(root)] : `${MINOR_NAMES[pc(root)]}m`
}

export const ALL_KEYS: SongKey[] = [
  ...Array.from({ length: 12 }, (_, t) => ({ tonic: t, mode: 'major' as Mode })),
  ...Array.from({ length: 12 }, (_, t) => ({ tonic: t, mode: 'minor' as Mode })),
]

export type VoiceCategory = {
  id: string
  label: string
  description: string
  group: 'general' | 'choir'
  range: VocalRange
}

export const VOICE_CATEGORIES: VoiceCategory[] = [
  { id: 'male', label: 'Male', description: 'Typical adult male voice', group: 'general', range: { low: 40, high: 67 } },
  { id: 'female', label: 'Female', description: 'Typical adult female voice', group: 'general', range: { low: 53, high: 79 } },
  { id: 'bass', label: 'Bass', description: 'Lowest male part', group: 'choir', range: { low: 40, high: 64 } },
  { id: 'baritone', label: 'Baritone', description: 'Most common', group: 'choir', range: { low: 43, high: 65 } },
  { id: 'tenor', label: 'Tenor', description: 'Highest male part', group: 'choir', range: { low: 48, high: 69 } },
  { id: 'alto', label: 'Alto', description: 'Lowest female part', group: 'choir', range: { low: 53, high: 74 } },
  { id: 'mezzo', label: 'Mezzo-Soprano', description: 'Most common', group: 'choir', range: { low: 57, high: 77 } },
  { id: 'soprano', label: 'Soprano', description: 'Highest female part', group: 'choir', range: { low: 60, high: 81 } },
]

/** Choir parts only — used to classify a tested range (works across male/female). */
export const CHOIR_VOICE_PARTS = VOICE_CATEGORIES.filter((c) => c.group === 'choir')

/** Find the choir voice part whose typical range best matches the tested range. */
export function closestVoicePart(range: VocalRange): VoiceCategory {
  const userCenter = (range.low + range.high) / 2
  const userSpan = range.high - range.low

  let best = CHOIR_VOICE_PARTS[0]
  let bestScore = Number.POSITIVE_INFINITY

  for (const part of CHOIR_VOICE_PARTS) {
    const partCenter = (part.range.low + part.range.high) / 2
    const partSpan = part.range.high - part.range.low
    const centerDist = Math.abs(userCenter - partCenter)
    const spanDist = Math.abs(userSpan - partSpan)
    const score = centerDist * 2 + spanDist * 0.35
    if (score < bestScore) {
      bestScore = score
      best = part
    }
  }

  return best
}

function hash(n: number) {
  let x = n ^ 0x5f3759df
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  return (x ^ (x >>> 16)) >>> 0
}

const WEIGHTED_KEYS: [SongKey, number][] = [
  [{ tonic: 7, mode: 'major' }, 4],
  [{ tonic: 0, mode: 'major' }, 4],
  [{ tonic: 2, mode: 'major' }, 4],
  [{ tonic: 9, mode: 'major' }, 3],
  [{ tonic: 4, mode: 'major' }, 3],
  [{ tonic: 5, mode: 'major' }, 2],
  [{ tonic: 10, mode: 'major' }, 1],
  [{ tonic: 3, mode: 'major' }, 1],
  [{ tonic: 11, mode: 'major' }, 1],
  [{ tonic: 9, mode: 'minor' }, 2],
  [{ tonic: 4, mode: 'minor' }, 2],
  [{ tonic: 11, mode: 'minor' }, 1],
  [{ tonic: 6, mode: 'minor' }, 1],
  [{ tonic: 2, mode: 'minor' }, 1],
  [{ tonic: 0, mode: 'minor' }, 1],
  [{ tonic: 7, mode: 'minor' }, 1],
]
const TOTAL_WEIGHT = WEIGHTED_KEYS.reduce((s, [, w]) => s + w, 0)

/**
 * iTunes doesn't expose musical key or melody data, so we derive a stable,
 * realistic estimate from the track ID. Users can correct the key in the UI.
 */
export function estimateSong(trackId: number): { key: SongKey; span: number } {
  const h = hash(trackId)
  let pick = h % TOTAL_WEIGHT
  let key = WEIGHTED_KEYS[0][0]
  for (const [k, w] of WEIGHTED_KEYS) {
    if (pick < w) {
      key = k
      break
    }
    pick -= w
  }
  const span = 12 + ((h >>> 8) % 5)
  return { key, span }
}

export function melodyRange(key: SongKey, span: number): VocalRange {
  const low = 48 + pc(key.tonic) - 5
  return { low, high: low + span }
}

export type FitStatus = 'perfect' | 'transpose' | 'out'

export type FitResult = {
  status: FitStatus
  shift: number
  sung: VocalRange
  base: VocalRange
  overflowLow: number
  overflowHigh: number
}

const MAX_SHIFT = 6

export function evaluateFit(user: VocalRange, song: VocalRange, dropOctave: boolean, fixedShift?: number): FitResult {
  const drop = dropOctave ? 12 : 0
  const base = { low: song.low - drop, high: song.high - drop }
  const fitsAt = (s: number) => base.low + s >= user.low && base.high + s <= user.high
  const ideal = Math.round((user.low + user.high) / 2 - (base.low + base.high) / 2)
  const clampedIdeal = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, ideal))

  let status: FitStatus
  let shift: number

  if (fixedShift !== undefined) {
    shift = fixedShift
    status = fitsAt(shift) ? 'perfect' : 'out'
  } else if (fitsAt(0)) {
    status = 'perfect'
    shift = 0
  } else {
    const fitting: number[] = []
    for (let s = -MAX_SHIFT; s <= MAX_SHIFT; s++) if (fitsAt(s)) fitting.push(s)
    if (fitting.length > 0) {
      status = 'transpose'
      shift = fitting.reduce((best, s) => (Math.abs(s - ideal) < Math.abs(best - ideal) ? s : best))
    } else {
      status = 'out'
      shift = clampedIdeal
    }
  }

  const sung = { low: base.low + shift, high: base.high + shift }
  return {
    status,
    shift,
    sung,
    base,
    overflowLow: Math.max(0, user.low - sung.low),
    overflowHigh: Math.max(0, sung.high - user.high),
  }
}

export type FitSeverity = 'comfortable' | 'strained' | 'out'

export type FitSeverityInfo = {
  severity: FitSeverity
  offBy: number
  direction: 'too high' | 'too low'
  dotClass: string
  label: string
}

function overflowDirection(full: VocalRange, sung: VocalRange): FitSeverityInfo['direction'] {
  const overflowLow = Math.max(0, full.low - sung.low)
  const overflowHigh = Math.max(0, sung.high - full.high)
  if (overflowHigh > overflowLow) return 'too high'
  if (overflowLow > overflowHigh) return 'too low'
  return overflowHigh > 0 ? 'too high' : 'too low'
}

/**
 * Banner severity from comfortable vs strained (full) vocal range.
 * - green: melody fits entirely in comfortable range
 * - yellow: fits in full/strained range but not fully comfortable
 * - red: outside the full range on either side
 */
export function fitSeverity(
  comfortable: VocalRange,
  full: VocalRange,
  sung: VocalRange,
): FitSeverityInfo {
  const direction = overflowDirection(full, sung)
  const overflowLow = Math.max(0, full.low - sung.low)
  const overflowHigh = Math.max(0, sung.high - full.high)
  const offBy = Math.max(overflowLow, overflowHigh)

  const inComfortable = sung.low >= comfortable.low && sung.high <= comfortable.high
  if (inComfortable) {
    return {
      severity: 'comfortable',
      offBy: 0,
      direction,
      dotClass: 'bg-emerald-500',
      label: 'Comfortable fit',
    }
  }

  const inFull = sung.low >= full.low && sung.high <= full.high
  if (inFull) {
    return {
      severity: 'strained',
      offBy: 0,
      direction,
      dotClass: 'bg-amber-500',
      label: 'Strained range',
    }
  }

  return {
    severity: 'out',
    offBy,
    direction,
    dotClass: 'bg-rose-500',
    label: 'Out of range',
  }
}

/** @deprecated Prefer fitSeverity(comfortable, full, sung). Kept for evaluateFit-only callers. */
export function fitSeverityFromFit(fit: FitResult): FitSeverityInfo {
  return fitSeverity(fit.sung, fit.sung, fit.sung)
}

const FRIENDLY_SHAPES: Record<Mode, number[]> = {
  major: [7, 0, 2, 9, 4],
  minor: [4, 9, 2],
}

export type CapoOption = {
  fret: number
  shape: SongKey
  shapeName: string
  chords: string[]
}

function progression(shape: SongKey) {
  const steps: [number, 'maj' | 'min'][] =
    shape.mode === 'major'
      ? [[0, 'maj'], [5, 'maj'], [7, 'maj'], [9, 'min']]
      : [[0, 'min'], [5, 'min'], [8, 'maj'], [10, 'maj']]
  return steps.map(([i, q]) => chordName(shape.tonic + i, q))
}

export function capoOptions(target: SongKey, limit = 2): CapoOption[] {
  const options: CapoOption[] = []
  for (let fret = 0; fret <= 9 && options.length < limit; fret++) {
    const shapeTonic = pc(target.tonic - fret)
    if (FRIENDLY_SHAPES[target.mode].includes(shapeTonic)) {
      const shape = { tonic: shapeTonic, mode: target.mode }
      options.push({ fret, shape, shapeName: keyName(shape), chords: progression(shape) })
    }
  }
  return options
}

export function transposeKey(key: SongKey, semitones: number): SongKey {
  return { tonic: pc(key.tonic + semitones), mode: key.mode }
}

export function formatRange(range: VocalRange) {
  return `${midiToName(range.low)} – ${midiToName(range.high)}`
}

/** Key shift the UI can represent without wrapping against octave (matches tonicDelta). */
const KEY_SHIFT_MIN = -6
const KEY_SHIFT_MAX = 6
const OCTAVE_SHIFT_MIN = -2
const OCTAVE_SHIFT_MAX = 2

export type BestVocalFit = {
  /** Semitone shift applied via play-in key (−6…+6). */
  shift: number
  /** Octave stepper value (−2…+2). */
  octaveShift: number
  /** Total semitones applied to the melody. */
  total: number
  sung: VocalRange
  overflowLow: number
  overflowHigh: number
  fits: boolean
}

/**
 * Decompose a total transposition into play-in key shift + octave so
 * tonicDelta(original, transposeKey(original, shift)) + 12*octave === total.
 */
export function decomposeVocalTranspose(total: number): { shift: number; octaveShift: number } {
  const minTotal = KEY_SHIFT_MIN + OCTAVE_SHIFT_MIN * 12
  const maxTotal = KEY_SHIFT_MAX + OCTAVE_SHIFT_MAX * 12
  const clamped = Math.max(minTotal, Math.min(maxTotal, total))

  let best: { shift: number; octaveShift: number; score: number } | null = null
  for (let octaveShift = OCTAVE_SHIFT_MIN; octaveShift <= OCTAVE_SHIFT_MAX; octaveShift++) {
    const shift = clamped - octaveShift * 12
    if (shift < KEY_SHIFT_MIN || shift > KEY_SHIFT_MAX) continue
    const score = Math.abs(octaveShift) * 10 + Math.abs(shift)
    if (!best || score < best.score) best = { shift, octaveShift, score }
  }

  if (best) return { shift: best.shift, octaveShift: best.octaveShift }

  // Fallback — should be unreachable when total is within reachable bounds.
  const octaveShift = Math.max(
    OCTAVE_SHIFT_MIN,
    Math.min(OCTAVE_SHIFT_MAX, Math.round(clamped / 12)),
  )
  const shift = Math.max(KEY_SHIFT_MIN, Math.min(KEY_SHIFT_MAX, clamped - octaveShift * 12))
  return { shift, octaveShift }
}

/**
 * Find the transposition that best fits `melody` into `user` range.
 * Searches every key+octave combo the UI can reach.
 *
 * Prefers a full fit centered in the voice. When two octaves both fit,
 * keep the higher one — singers reported the old low-bias as “an octave too low.”
 */
export function findBestVocalFit(user: VocalRange, melody: VocalRange): BestVocalFit {
  const userSpan = Math.max(user.high - user.low, 1)
  const userMid = user.low + userSpan / 2
  const melodyCenter = (melody.low + melody.high) / 2

  let best: { score: number; shift: number; octaveShift: number } | null = null

  for (let octaveShift = OCTAVE_SHIFT_MIN; octaveShift <= OCTAVE_SHIFT_MAX; octaveShift++) {
    for (let shift = KEY_SHIFT_MIN; shift <= KEY_SHIFT_MAX; shift++) {
      const total = shift + octaveShift * 12
      const sungLow = melody.low + total
      const sungHigh = melody.high + total
      const overflowLow = Math.max(0, user.low - sungLow)
      const overflowHigh = Math.max(0, sungHigh - user.high)
      const maxOverflow = Math.max(overflowLow, overflowHigh)
      const sumOverflow = overflowLow + overflowHigh
      const imbalance = Math.abs(overflowLow - overflowHigh)
      const songCenter = (sungLow + sungHigh) / 2
      const centerDist = Math.abs(songCenter - userMid)
      const idealDist = Math.abs(total - Math.round(userMid - melodyCenter))

      // 1) Minimize worst-end overflow
      // 2) Balance / total spill
      // 3) Sit near the middle of the voice
      // 4) Prefer smaller |octave| moves, then smaller |key| moves
      // 5) Tiny nudge toward higher placements when otherwise tied (avoid habitual -1 octave)
      const score =
        maxOverflow * 1_000_000_000 +
        imbalance * 10_000_000 +
        sumOverflow * 100_000 +
        centerDist * 10_000 +
        idealDist * 100 +
        Math.abs(octaveShift) * 80 +
        Math.abs(shift) * 0.05 -
        octaveShift * 2

      if (!best || score < best.score) {
        best = { score, shift, octaveShift }
      }
    }
  }

  let shift = best?.shift ?? 0
  let octaveShift = best?.octaveShift ?? 0

  // If a higher octave still fully fits, prefer it — calibration was often one too low.
  while (
    octaveShift < OCTAVE_SHIFT_MAX &&
    melodyFitsUser(user, melody, shift, octaveShift + 1)
  ) {
    octaveShift += 1
  }

  const applied = shift + octaveShift * 12
  const sung = { low: melody.low + applied, high: melody.high + applied }
  const overflowLow = Math.max(0, user.low - sung.low)
  const overflowHigh = Math.max(0, sung.high - user.high)

  return {
    shift,
    octaveShift,
    total: applied,
    sung,
    overflowLow,
    overflowHigh,
    fits: overflowLow === 0 && overflowHigh === 0,
  }
}

function melodyFitsUser(
  user: VocalRange,
  melody: VocalRange,
  shift: number,
  octaveShift: number,
) {
  const total = shift + octaveShift * 12
  const sungLow = melody.low + total
  const sungHigh = melody.high + total
  return sungLow >= user.low && sungHigh <= user.high
}
