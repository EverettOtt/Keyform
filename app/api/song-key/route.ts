import { lookupSongKey } from '@/lib/getsongkey'
import { keyName } from '@/lib/music'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const title = searchParams.get('title')?.trim() ?? ''
  const artist = searchParams.get('artist')?.trim() ?? ''

  if (!title || !artist) {
    return Response.json({ error: 'title and artist are required' }, { status: 400 })
  }

  try {
    const key = await lookupSongKey(title, artist)
    if (!key) return Response.json({ key: null })
    return Response.json({ key, label: keyName(key) })
  } catch {
    return Response.json({ key: null }, { status: 502 })
  }
}
