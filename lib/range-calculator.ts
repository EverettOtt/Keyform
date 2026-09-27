import songsDb from '@/lib/songs-db.json'
import { midiToName, parseKey } from '@/lib/music'

export type MelodyRangeEstimate = {
  lowNote: string
  highNote: string
  isEstimated: boolean
}

export type ResolvedSongData = {
  title: string
  artist: string
  key: string
  lowNote: string
  highNote: string
  isEstimated: boolean
}

type SongDbEntry = {
  title: string
  artist: string
  key: string
  lowNote: string
  highNote: string
}

/** ~1.3 octaves in semitones (1.3 × 12 ≈ 15.6 → 16). */
const ESTIMATED_SPAN_SEMITONES = Math.round(1.3 * 12)

const NOTE_PC: Record<string, number> = {
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

function normalizeTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Estimate a ~1.3-octave melody range anchored on the key's root
 * (tonic in octave 3 as the low note).
 */
export function getMelodyRangeForKey(key: string): MelodyRangeEstimate {
  const parsed = parseKey(key)
  if (!parsed) {
    // Sensible fallback if the key string can't be parsed
    return { lowNote: 'C3', highNote: midiToName(48 + ESTIMATED_SPAN_SEMITONES), isEstimated: true }
  }

  // Octave 3 tonic: MIDI = (3 + 1) * 12 + pitchClass = 48 + pc
  const lowMidi = 48 + parsed.tonic
  const highMidi = lowMidi + ESTIMATED_SPAN_SEMITONES

  return {
    lowNote: midiToName(lowMidi),
    highNote: midiToName(highMidi),
    isEstimated: true,
  }
}

/** Look up a verified melody range, or estimate range from the crowdsourced key. */
export function resolveSongData(
  songTitle: string,
  artist: string,
  apiReturnedKey: string,
): ResolvedSongData {
  const want = normalizeTitle(songTitle)
  const hit = (songsDb as SongDbEntry[]).find((s) => normalizeTitle(s.title) === want)
  const crowdKey = apiReturnedKey
  const crowdParsed = parseKey(crowdKey)
  const dbParsed = hit ? parseKey(hit.key) : null

  // Keep the crowdsourced key authoritative. Only reuse DB range notes when keys match.
  if (hit && crowdParsed && dbParsed && crowdParsed.tonic === dbParsed.tonic && crowdParsed.mode === dbParsed.mode) {
    return {
      title: hit.title,
      artist: hit.artist,
      key: crowdKey,
      lowNote: hit.lowNote,
      highNote: hit.highNote,
      isEstimated: false,
    }
  }

  const estimated = getMelodyRangeForKey(crowdKey)
  return {
    title: songTitle,
    artist,
    key: crowdKey,
    lowNote: estimated.lowNote,
    highNote: estimated.highNote,
    isEstimated: true,
  }
}

/** Convert scientific pitch names like "E3" / "Bb4" to MIDI numbers. */
export function noteNameToMidi(note: string): number | null {
  const cleaned = note
    .trim()
    .replace(/[♯]/g, '#')
    .replace(/[♭]/g, 'b')
  const match = cleaned.match(/^([A-Ga-g](?:#|b)?)(-?\d+)$/)
  if (!match) return null

  const letter = match[1][0].toUpperCase() + match[1].slice(1)
  const pc = NOTE_PC[letter]
  if (pc === undefined) return null

  const octave = Number(match[2])
  return (octave + 1) * 12 + pc
}
