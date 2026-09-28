import { getUgSearchUrl, resolveUgChordsTabUrl } from '@/lib/ultimate-guitar'

/**
 * GET /api/ug-tab?artist=...&title=...
 * Redirects to the best Ultimate Guitar chords tab for the song
 * (falls back to a Chords-filtered search).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const artist = searchParams.get('artist')?.trim() ?? ''
  const title = searchParams.get('title')?.trim() ?? ''

  if (!artist || !title) {
    return Response.redirect('https://www.ultimate-guitar.com/search.php', 302)
  }

  const url = await resolveUgChordsTabUrl(artist, title)
  return Response.redirect(url || getUgSearchUrl(artist, title), 302)
}
