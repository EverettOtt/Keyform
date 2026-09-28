import { deduplicateSearchResults, type ItunesTrack } from '@/lib/itunes'

export const maxDuration = 15

type ItunesResponse = { resultCount?: number; results?: ItunesTrack[] }

/**
 * GET /api/search?q=wonderwall
 * Server-side iTunes proxy so public deploys aren't blocked by browser CORS / network filters.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return Response.json({ results: [] as ItunesTrack[] })
  }

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=25`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) {
      return Response.json({ error: 'Search upstream failed' }, { status: 502 })
    }

    const data = (await res.json()) as ItunesResponse
    const valid = (data.results ?? []).filter((t) => t.trackId && t.trackName)
    return Response.json({ results: deduplicateSearchResults(valid) })
  } catch {
    return Response.json({ error: 'Search failed' }, { status: 502 })
  }
}
