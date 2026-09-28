import { formatKeyLabel, type SongKey } from '@/lib/music'

type UgSearchResult = {
  artist_name?: string
  song_name?: string
  type?: string | null
  marketing_type?: string | null
  tab_url?: string
  votes?: number | null
  rating?: number | null
  version?: number | null
  common_version?: number | null
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Filtered UG search (Chords) — used when we can't resolve a direct tab. */
export function getUgSearchUrl(artist: string, song: string): string {
  const value = encodeURIComponent(`${artist} ${song}`.trim())
  return `https://www.ultimate-guitar.com/search.php?search_type=title&value=${value}&type%5B0%5D=Chords`
}

/**
 * Client link that hits our resolver so users land on the best chords tab
 * instead of UG's search box. Affiliate wrapping can still wrap this later.
 */
export function getUGAffiliateLink(artist: string, song: string): string {
  const params = new URLSearchParams({ artist, title: song })
  return `/api/ug-tab?${params.toString()}`
}

function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

function pickBestChordsTab(
  results: UgSearchResult[],
  artist: string,
  song: string,
): string | null {
  const wantArtist = normalizeName(artist)
  const wantSong = normalizeName(song)

  const chords = results.filter((item) => {
    if (item.type !== 'Chords' || !item.tab_url) return false
    if (!item.tab_url.includes('tabs.ultimate-guitar.com/tab/')) return false
    return namesMatch(normalizeName(item.artist_name ?? ''), wantArtist)
  })

  const exactSong = chords.filter((item) => normalizeName(item.song_name ?? '') === wantSong)
  const looseSong = chords.filter((item) =>
    namesMatch(normalizeName(item.song_name ?? ''), wantSong),
  )
  const pool = exactSong.length > 0 ? exactSong : looseSong
  if (pool.length === 0) return null

  pool.sort((a, b) => {
    const common = (b.common_version ?? 0) - (a.common_version ?? 0)
    if (common !== 0) return common
    const votes = (b.votes ?? 0) - (a.votes ?? 0)
    if (votes !== 0) return votes
    return (b.rating ?? 0) - (a.rating ?? 0)
  })

  return pool[0]?.tab_url ?? null
}

const UG_FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent':
    'Mozilla/5.0 (compatible; CapoKey/1.0; +https://github.com/capokey) AppleWebKit/537.36',
} as const

function decodeUgJsStore(html: string): unknown | null {
  const storeMatch = html.match(/class="js-store"[^>]*data-content="([^"]+)"/)
  if (!storeMatch?.[1]) return null

  const decoded = storeMatch[1]
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

  try {
    return JSON.parse(decoded) as unknown
  } catch {
    return null
  }
}

/** Best free chords tab URL, or null when search can't resolve a real tab page. */
export async function findBestUgChordsTabUrl(
  artist: string,
  song: string,
): Promise<string | null> {
  const query = `${artist} ${song}`.trim()
  if (!query) return null

  try {
    const searchUrl = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`
    const response = await fetch(searchUrl, {
      headers: UG_FETCH_HEADERS,
      next: { revalidate: 86_400 },
    })
    if (!response.ok) return null

    const data = decodeUgJsStore(await response.text()) as {
      store?: { page?: { data?: { results?: UgSearchResult[] } } }
    } | null
    const results = data?.store?.page?.data?.results
    if (!Array.isArray(results) || results.length === 0) return null

    return pickBestChordsTab(results, artist, song)
  } catch {
    return null
  }
}

/**
 * Resolve the best free Ultimate Guitar chords tab for artist + song.
 * Falls back to a Chords-filtered search URL when no tab is found.
 */
export async function resolveUgChordsTabUrl(artist: string, song: string): Promise<string> {
  return (await findBestUgChordsTabUrl(artist, song)) ?? getUgSearchUrl(artist, song)
}

/**
 * Read the published tonality from a UG chords tab page (e.g. "F#m", "G").
 */
export async function fetchUgTabTonality(tabUrl: string): Promise<string | null> {
  if (!tabUrl.includes('tabs.ultimate-guitar.com/tab/')) return null

  try {
    const response = await fetch(tabUrl, {
      headers: UG_FETCH_HEADERS,
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) return null

    const data = decodeUgJsStore(await response.text()) as {
      store?: {
        page?: {
          data?: {
            tab?: { tonality_name?: string }
            tab_view?: { meta?: { tonality?: string } }
          }
        }
      }
    } | null

    const page = data?.store?.page?.data
    const raw =
      page?.tab_view?.meta?.tonality?.trim() ||
      page?.tab?.tonality_name?.trim() ||
      ''
    return raw || null
  } catch {
    return null
  }
}

/**
 * Shift from original → play-in key, normalized into Ultimate Guitar's
 * typical transpose UI range of -6…+6.
 */
export function ugTransposeShift(original: SongKey, target: SongKey): number {
  let shift = target.tonic - original.tonic
  if (shift > 6) shift -= 12
  if (shift < -6) shift += 12
  return shift
}

export type UgTransposeGuide = {
  shift: number
  /** Single primary line — the only place the shift amount appears. */
  title: string
  detail: string
  capoTip: string | null
}

/** Human-readable Ultimate Guitar transpose + optional capo instructions. */
export function getUgTransposeGuide(original: SongKey, target: SongKey): UgTransposeGuide {
  const shift = ugTransposeShift(original, target)
  const signed = shift > 0 ? `+${shift}` : `${shift}`

  if (shift === 0) {
    return {
      shift,
      title: 'Leave Transpose at 0',
      detail: 'Open the chord sheet and play in the original key.',
      capoTip: null,
    }
  }

  return {
    shift,
    title: `Set Transpose to ${signed}`,
    detail: 'Open the chord sheet and use the Transpose control at the bottom.',
    capoTip: shift > 0 ? `Or capo fret ${shift} and play in ${formatKeyLabel(original)}` : null,
  }
}
