import { parseKey } from '@/lib/music'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const title = typeof body === 'object' && body && 'title' in body ? String((body as { title: unknown }).title ?? '').trim() : ''
  const artist =
    typeof body === 'object' && body && 'artist' in body ? String((body as { artist: unknown }).artist ?? '').trim() : ''
  const correctedKeyRaw =
    typeof body === 'object' && body && 'correctedKey' in body
      ? String((body as { correctedKey: unknown }).correctedKey ?? '').trim()
      : ''

  if (!title || !artist || !correctedKeyRaw) {
    return Response.json({ error: 'title, artist, and correctedKey are required' }, { status: 400 })
  }

  const correctedKey = parseKey(correctedKeyRaw)
  if (!correctedKey) {
    return Response.json({ error: 'correctedKey must be a valid key label' }, { status: 400 })
  }

  // Placeholder: persist community corrections when a store is available.
  console.info('[community-key-correction]', { title, artist, correctedKey: correctedKeyRaw })

  return Response.json({
    ok: true,
    received: { title, artist, correctedKey: correctedKeyRaw },
  })
}
