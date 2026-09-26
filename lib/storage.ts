import { midiToName, type VocalRange } from '@/lib/music'
import { noteNameToMidi } from '@/lib/range-calculator'

export const VOCAL_RANGE_KEY = 'keyform_vocal_range'
export const SAVED_SONGS_KEY = 'keyform_saved_songs'

export type StoredVocalRange = {
  lowNote: string
  highNote: string
  /** Comfortable (non-strained) bounds — omit when identical to full range. */
  comfortableLowNote?: string
  comfortableHighNote?: string
  label: string
}

export type SavedVocalProfile = {
  range: VocalRange
  comfortable: VocalRange
  label: string
}

export type SavedSong = {
  songId: number
  title: string
  artist: string
  playInKey: string
  octaveShift: number
  capoFret: number
  voiceCalibrated?: boolean
  artworkUrl100?: string
  previewUrl?: string
  collectionName?: string
  savedAt: number
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function saveVocalRange(range: VocalRange, label: string, comfortable?: VocalRange) {
  if (!canUseStorage()) return
  const comfort = comfortable ?? range
  const payload: StoredVocalRange = {
    lowNote: midiToName(range.low),
    highNote: midiToName(range.high),
    label,
  }
  if (comfort.low !== range.low || comfort.high !== range.high) {
    payload.comfortableLowNote = midiToName(comfort.low)
    payload.comfortableHighNote = midiToName(comfort.high)
  }
  localStorage.setItem(VOCAL_RANGE_KEY, JSON.stringify(payload))
}

export function loadVocalRange(): SavedVocalProfile | null {
  if (!canUseStorage()) return null
  try {
    const raw = localStorage.getItem(VOCAL_RANGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredVocalRange
    const low = noteNameToMidi(parsed.lowNote)
    const high = noteNameToMidi(parsed.highNote)
    if (low === null || high === null || !parsed.label) return null
    const range = { low, high: Math.max(high, low) }

    const cLow = parsed.comfortableLowNote ? noteNameToMidi(parsed.comfortableLowNote) : null
    const cHigh = parsed.comfortableHighNote ? noteNameToMidi(parsed.comfortableHighNote) : null
    const comfortable =
      cLow !== null && cHigh !== null
        ? { low: cLow, high: Math.max(cHigh, cLow) }
        : { ...range }

    return { range, comfortable, label: parsed.label }
  } catch {
    return null
  }
}

export function clearVocalRange() {
  if (!canUseStorage()) return
  localStorage.removeItem(VOCAL_RANGE_KEY)
}

export function loadSavedSongs(): SavedSong[] {
  if (!canUseStorage()) return []
  try {
    const raw = localStorage.getItem(SAVED_SONGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedSong[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s) =>
        typeof s?.songId === 'number' &&
        typeof s?.title === 'string' &&
        typeof s?.artist === 'string' &&
        typeof s?.playInKey === 'string' &&
        typeof s?.octaveShift === 'number' &&
        typeof s?.capoFret === 'number',
    )
  } catch {
    return []
  }
}

function writeSavedSongs(songs: SavedSong[]) {
  if (!canUseStorage()) return
  localStorage.setItem(SAVED_SONGS_KEY, JSON.stringify(songs))
}

export function isSongSaved(songId: number) {
  return loadSavedSongs().some((s) => s.songId === songId)
}

export function getSavedSong(songId: number) {
  return loadSavedSongs().find((s) => s.songId === songId) ?? null
}

export function upsertSavedSong(song: Omit<SavedSong, 'savedAt'> & { savedAt?: number }) {
  const songs = loadSavedSongs().filter((s) => s.songId !== song.songId)
  const next: SavedSong = { ...song, savedAt: song.savedAt ?? Date.now() }
  songs.unshift(next)
  writeSavedSongs(songs)
  return next
}

export function removeSavedSong(songId: number) {
  writeSavedSongs(loadSavedSongs().filter((s) => s.songId !== songId))
}
