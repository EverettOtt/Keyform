import { parseKey, type SongKey } from '@/lib/music'

const API_BASE = 'https://api.getsong.co'

type SearchHit = {
  song_id?: string
  id?: string
  song_title?: string
  title?: string
  key_of?: string | null
  artist?: { name?: string } | string
}

type SongPayload = {
  song?: {
    id?: string
    title?: string
    key_of?: string | null
    artist?: { name?: string }
  }
}

function artistName(hit: SearchHit) {
  if (!hit.artist) return ''
  return typeof hit.artist === 'string' ? hit.artist : (hit.artist.name ?? '')
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function scoreHit(hit: SearchHit, title: string, artist: string) {
  const hitTitle = normalize(hit.song_title ?? hit.title ?? '')
  const hitArtist = normalize(artistName(hit))
  const wantTitle = normalize(title)
  const wantArtist = normalize(artist)
  if (!hitTitle) return -1

  let score = 0
  if (hitTitle === wantTitle) score += 5
  else if (hitTitle.includes(wantTitle) || wantTitle.includes(hitTitle)) score += 3

  if (hitArtist && wantArtist) {
    if (hitArtist === wantArtist) score += 5
    else if (hitArtist.includes(wantArtist) || wantArtist.includes(hitArtist)) score += 3
  }

  if (hit.key_of) score += 1
  return score
}

function parseVerifiedKey(raw: string | null | undefined): SongKey | null {
  if (!raw || !raw.trim()) return null
  return parseKey(raw)
}

/**
 * Look up a song's published key via the GetSongKEY / GetSongBPM Web API
 * (shared base: api.getsong.co). Requires GETSONGKEY_API_KEY or GETSONGBPM_API_KEY.
 */
export async function lookupSongKey(title: string, artist: string): Promise<SongKey | null> {
  const apiKey = process.env.GETSONGKEY_API_KEY || process.env.GETSONGBPM_API_KEY
  if (!apiKey) return null

  const lookup = `song:${title} artist:${artist}`
  const searchUrl = new URL(`${API_BASE}/search/`)
  searchUrl.searchParams.set('api_key', apiKey)
  searchUrl.searchParams.set('type', 'both')
  searchUrl.searchParams.set('lookup', lookup)
  searchUrl.searchParams.set('limit', '5')

  const searchRes = await fetch(searchUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Keyform/1.0',
    },
    cache: 'no-store',
  })
  if (!searchRes.ok) return null

  const searchJson = (await searchRes.json()) as { search?: SearchHit[] | { error?: string } }
  if (!Array.isArray(searchJson.search) || searchJson.search.length === 0) return null

  const ranked = [...searchJson.search]
    .map((hit) => ({ hit, score: scoreHit(hit, title, artist) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]?.hit
  if (!best) return null

  const fromSearch = parseVerifiedKey(best.key_of ?? undefined)
  if (fromSearch) return fromSearch

  const songId = best.song_id ?? best.id
  if (!songId) return null

  const songUrl = new URL(`${API_BASE}/song/`)
  songUrl.searchParams.set('api_key', apiKey)
  songUrl.searchParams.set('id', songId)

  const songRes = await fetch(songUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Keyform/1.0',
    },
    cache: 'no-store',
  })
  if (!songRes.ok) return null

  const songJson = (await songRes.json()) as SongPayload
  return parseVerifiedKey(songJson.song?.key_of ?? undefined)
}

/** Client helper: asks our Next.js proxy, which calls GetSongKEY server-side. */
export async function fetchSongKey(title: string, artist: string): Promise<SongKey | null> {
  const params = new URLSearchParams({ title, artist })
  const res = await fetch(`/api/song-key?${params}`)
  if (!res.ok) return null

  const data = (await res.json()) as { key?: SongKey | null }
  return data.key ?? null
}
