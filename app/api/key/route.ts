import { formatKeyLabel, parseKey } from '@/lib/music'
import { lookupSongKey } from '@/lib/song-key-lookup'
import { getStoredKey, setStoredKey } from '@/lib/song-key-store'
import { songSlug } from '@/lib/song-slug'

/** Allow Ultimate Guitar / Jina fallbacks on cold Redis misses. */
export const maxDuration = 60

/**
 * Global song keys (crowdsourced + auto-populated baseline).
 * Persistence: `@upstash/redis` via UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 * (or Vercel-compatible KV_REST_API_URL / KV_REST_API_TOKEN aliases).
 */

/** GET /api/key?slug=artist-name:song-title&artist=...&title=... */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slugParam = searchParams.get('slug')?.trim() ?? ''
  const artistParam = searchParams.get('artist')?.trim() ?? ''
  const titleParam = searchParams.get('title')?.trim() ?? ''

  const slug =
    slugParam && slugParam.includes(':')
      ? slugParam
      : artistParam && titleParam
        ? songSlug(artistParam, titleParam)
        : ''

  if (!slug || !slug.includes(':')) {
    return Response.json(
      { error: 'slug query param is required (artist:title), or pass artist and title' },
      { status: 400 },
    )
  }

  const record = await getStoredKey(slug)
  if (record) {
    return Response.json({
      found: true,
      key: record.key,
      slug,
      artist: record.artist,
      title: record.title,
      updatedAt: record.updatedAt,
      source: 'redis',
    })
  }

  // Auto-populate baseline when Redis misses (UG tonality, optional LLM).
  const artist =
    artistParam ||
    slug
      .split(':')[0]
      ?.replace(/-/g, ' ')
      .trim() ||
    ''
  const title =
    titleParam ||
    slug
      .split(':')
      .slice(1)
      .join(':')
      .replace(/-/g, ' ')
      .trim() ||
    ''

  if (artist && title) {
    try {
      const lookedUp = await lookupSongKey(artist, title)
      if (lookedUp) {
        const saved = await setStoredKey(slug, {
          artist: artistParam || artist,
          title: titleParam || title,
          key: lookedUp.key,
        })
        return Response.json({
          found: true,
          key: saved.key,
          slug,
          artist: saved.artist,
          title: saved.title,
          updatedAt: saved.updatedAt,
          source: lookedUp.source,
        })
      }
    } catch {
      /* fall through to not-found — UI can crowdsource */
    }
  }

  return Response.json({ found: false, key: null, slug, source: null })
}

/** POST /api/key  body: { artist, title, key } — crowdsource / correction overwrite */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const artist =
    typeof body === 'object' && body && 'artist' in body
      ? String((body as { artist: unknown }).artist ?? '').trim()
      : ''
  const title =
    typeof body === 'object' && body && 'title' in body
      ? String((body as { title: unknown }).title ?? '').trim()
      : ''
  const keyRaw =
    typeof body === 'object' && body && 'key' in body
      ? String((body as { key: unknown }).key ?? '').trim()
      : ''

  if (!artist || !title || !keyRaw) {
    return Response.json({ error: 'artist, title, and key are required' }, { status: 400 })
  }

  const parsed = parseKey(keyRaw)
  if (!parsed) {
    return Response.json({ error: 'key must be a valid musical key label' }, { status: 400 })
  }

  const key = formatKeyLabel(parsed)
  const slug = songSlug(artist, title)
  if (!slug || slug === ':') {
    return Response.json({ error: 'Could not normalize artist/title into a slug' }, { status: 400 })
  }

  await setStoredKey(slug, { artist, title, key })
  return Response.json({ success: true, key, slug, source: 'crowd' })
}
