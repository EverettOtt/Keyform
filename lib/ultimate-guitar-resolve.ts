import { getCachedUgTabUrl, setCachedUgTabUrl } from '@/lib/song-key-store'
import { songSlug } from '@/lib/song-slug'
import { getUgSearchUrl } from '@/lib/ultimate-guitar'

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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
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

/**
 * Fetch UG HTML. Direct fetch often fails from Vercel IPs, so fall back to
 * Jina's HTML mirror which still includes the js-store payload.
 */
async function fetchUgPageHtml(targetUrl: string): Promise<string | null> {
  try {
    const direct = await fetch(targetUrl, {
      headers: UG_FETCH_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (direct.ok) {
      const html = await direct.text()
      if (html.includes('js-store') && html.includes('data-content=')) return html
    }
  } catch {
    /* try proxy */
  }

  try {
    const proxyUrl = `https://r.jina.ai/${targetUrl.replace(/^http:\/\//i, 'https://')}`
    const proxied = await fetch(proxyUrl, {
      headers: {
        Accept: '*/*',
        'User-Agent': UG_FETCH_HEADERS['User-Agent'],
        'X-Return-Format': 'html',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    if (!proxied.ok) return null
    const html = await proxied.text()
    return html.includes('data-content=') ? html : null
  } catch {
    return null
  }
}

function resultsFromHtml(html: string): UgSearchResult[] {
  const data = decodeUgJsStore(html) as {
    store?: { page?: { data?: { results?: UgSearchResult[] } } }
  } | null
  const results = data?.store?.page?.data?.results
  return Array.isArray(results) ? results : []
}

/** Best free chords tab URL, or null when search can't resolve a real tab page. */
export async function findBestUgChordsTabUrl(
  artist: string,
  song: string,
): Promise<string | null> {
  const query = `${artist} ${song}`.trim()
  if (!query) return null

  const slug = songSlug(artist, song)
  if (slug && slug !== ':') {
    const cached = await getCachedUgTabUrl(slug)
    if (cached?.includes('tabs.ultimate-guitar.com/tab/')) return cached
  }

  try {
    const searchUrl = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`
    const html = await fetchUgPageHtml(searchUrl)
    if (!html) return null

    const picked = pickBestChordsTab(resultsFromHtml(html), artist, song)
    if (picked && slug && slug !== ':') {
      await setCachedUgTabUrl(slug, picked)
    }
    return picked
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

function tonalityFromHtml(html: string): string | null {
  const data = decodeUgJsStore(html) as {
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
    page?.tab_view?.meta?.tonality?.trim() || page?.tab?.tonality_name?.trim() || ''
  return raw || null
}

function tonalityFromMarkdown(text: string): string | null {
  const match = text.match(/\|\s*Key:\s*\|\s*([A-Ga-g](?:#|b)?m?)\s*\|/)
  return match?.[1]?.trim() || null
}

/**
 * Read the published tonality from a UG chords tab page (e.g. "F#m", "G").
 */
export async function fetchUgTabTonality(tabUrl: string): Promise<string | null> {
  if (!tabUrl.includes('tabs.ultimate-guitar.com/tab/')) return null

  try {
    const html = await fetchUgPageHtml(tabUrl)
    if (html) {
      const fromStore = tonalityFromHtml(html)
      if (fromStore) return fromStore
    }

    const proxyUrl = `https://r.jina.ai/${tabUrl}`
    const md = await fetch(proxyUrl, {
      headers: {
        Accept: 'text/plain',
        'User-Agent': UG_FETCH_HEADERS['User-Agent'],
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    if (!md.ok) return null
    return tonalityFromMarkdown(await md.text())
  } catch {
    return null
  }
}
