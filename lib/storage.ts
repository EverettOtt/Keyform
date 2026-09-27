import { midiToName, type VocalRange } from '@/lib/music'
import { noteNameToMidi } from '@/lib/range-calculator'

export const VOCAL_RANGE_KEY = 'keyform_vocal_range'
export const SAVED_SONGS_KEY = 'keyform_saved_songs'
const VOCAL_RANGE_COOKIE = 'keyform_vr'

export type StoredVocalRange = {
  /** Preferred durable fields */
  lowMidi?: number
  highMidi?: number
  comfortableLowMidi?: number
  comfortableHighMidi?: number
  /** Legacy note-name fields (still written for readability / older clients) */
  lowNote?: string
  highNote?: string
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
  return typeof window !== 'undefined'
}

function storageAvailable() {
  if (!canUseStorage()) return false
  try {
    const k = '__keyform_storage_test__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(name: string, value: string, maxAgeDays = 400) {
  if (typeof document === 'undefined') return
  const maxAge = maxAgeDays * 24 * 60 * 60
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`
}

function clearCookie(name: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`
}

function isMidi(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 127
}

function profileFromStored(parsed: StoredVocalRange): SavedVocalProfile | null {
  if (!parsed?.label || typeof parsed.label !== 'string') return null

  const low =
    (isMidi(parsed.lowMidi) ? parsed.lowMidi : null) ??
    (parsed.lowNote ? noteNameToMidi(parsed.lowNote) : null)
  const high =
    (isMidi(parsed.highMidi) ? parsed.highMidi : null) ??
    (parsed.highNote ? noteNameToMidi(parsed.highNote) : null)
  if (low === null || high === null) return null

  const range = { low, high: Math.max(high, low) }

  const cLow =
    (isMidi(parsed.comfortableLowMidi) ? parsed.comfortableLowMidi : null) ??
    (parsed.comfortableLowNote ? noteNameToMidi(parsed.comfortableLowNote) : null)
  const cHigh =
    (isMidi(parsed.comfortableHighMidi) ? parsed.comfortableHighMidi : null) ??
    (parsed.comfortableHighNote ? noteNameToMidi(parsed.comfortableHighNote) : null)

  const comfortable =
    cLow !== null && cHigh !== null ? { low: cLow, high: Math.max(cHigh, cLow) } : { ...range }

  return { range, comfortable, label: parsed.label }
}

function cookieFromProfile(profile: SavedVocalProfile): string {
  const { range, comfortable, label } = profile
  return [range.low, range.high, comfortable.low, comfortable.high, label].join('|')
}

function profileFromCookie(raw: string): SavedVocalProfile | null {
  const parts = raw.split('|')
  if (parts.length < 5) return null
  const [lowS, highS, cLowS, cHighS, ...labelParts] = parts
  const low = Number(lowS)
  const high = Number(highS)
  const cLow = Number(cLowS)
  const cHigh = Number(cHighS)
  const label = labelParts.join('|').trim()
  if (!label || ![low, high, cLow, cHigh].every(isMidi)) return null
  return {
    range: { low, high: Math.max(high, low) },
    comfortable: { low: cLow, high: Math.max(cHigh, cLow) },
    label,
  }
}

export function saveVocalRange(range: VocalRange, label: string, comfortable?: VocalRange) {
  if (!canUseStorage()) return
  const comfort = comfortable ?? range
  const payload: StoredVocalRange = {
    lowMidi: range.low,
    highMidi: range.high,
    lowNote: midiToName(range.low),
    highNote: midiToName(range.high),
    label,
  }
  if (comfort.low !== range.low || comfort.high !== range.high) {
    payload.comfortableLowMidi = comfort.low
    payload.comfortableHighMidi = comfort.high
    payload.comfortableLowNote = midiToName(comfort.low)
    payload.comfortableHighNote = midiToName(comfort.high)
  }

  if (storageAvailable()) {
    try {
      localStorage.setItem(VOCAL_RANGE_KEY, JSON.stringify(payload))
    } catch {
      /* quota / private mode — cookie backup still written below */
    }
  }

  writeCookie(
    VOCAL_RANGE_COOKIE,
    cookieFromProfile({ range, comfortable: comfort, label }),
  )
}

export function loadVocalRange(): SavedVocalProfile | null {
  if (!canUseStorage()) return null

  if (storageAvailable()) {
    try {
      const raw = localStorage.getItem(VOCAL_RANGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as StoredVocalRange
        const profile = profileFromStored(parsed)
        if (profile) {
          // Refresh cookie backup so both stay in sync.
          writeCookie(VOCAL_RANGE_COOKIE, cookieFromProfile(profile))
          return profile
        }
      }
    } catch {
      /* fall through to cookie */
    }
  }

  const cookieRaw = readCookie(VOCAL_RANGE_COOKIE)
  if (!cookieRaw) return null
  const fromCookie = profileFromCookie(cookieRaw)
  if (fromCookie && storageAvailable()) {
    // Rehydrate localStorage from cookie when possible.
    saveVocalRange(fromCookie.range, fromCookie.label, fromCookie.comfortable)
  }
  return fromCookie
}

export function clearVocalRange() {
  if (!canUseStorage()) return
  if (storageAvailable()) {
    try {
      localStorage.removeItem(VOCAL_RANGE_KEY)
    } catch {
      /* ignore */
    }
  }
  clearCookie(VOCAL_RANGE_COOKIE)
}

export function loadSavedSongs(): SavedSong[] {
  if (!canUseStorage() || !storageAvailable()) return []
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
  if (!canUseStorage() || !storageAvailable()) return
  try {
    localStorage.setItem(SAVED_SONGS_KEY, JSON.stringify(songs))
  } catch {
    /* private mode / quota */
  }
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
