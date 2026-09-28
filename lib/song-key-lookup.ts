import { formatKeyLabel, parseKey } from '@/lib/music'
import { fetchUgTabTonality, findBestUgChordsTabUrl } from '@/lib/ultimate-guitar'

export type SongKeySource = 'redis' | 'ultimate-guitar' | 'openai' | 'gemini'

export type SongKeyLookupResult = {
  key: string
  source: Exclude<SongKeySource, 'redis'>
}

function standardizeKey(raw: string): string | null {
  const parsed = parseKey(raw)
  if (!parsed) return null
  return formatKeyLabel(parsed)
}

async function lookupKeyFromUltimateGuitar(
  artist: string,
  title: string,
): Promise<SongKeyLookupResult | null> {
  const tabUrl = await findBestUgChordsTabUrl(artist, title)
  if (!tabUrl) return null

  const tonality = await fetchUgTabTonality(tabUrl)
  if (!tonality) return null

  const key = standardizeKey(tonality)
  if (!key) return null

  return { key, source: 'ultimate-guitar' }
}

async function lookupKeyFromOpenAI(
  artist: string,
  title: string,
): Promise<SongKeyLookupResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        model: process.env.OPENAI_SONG_KEY_MODEL?.trim() || 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 20,
        messages: [
          {
            role: 'system',
            content:
              'You are a music expert. Reply with ONLY the original recorded song key as a short label like "G major", "A minor", or "F# minor". If unsure, reply "unknown".',
          },
          {
            role: 'user',
            content: `What is the original key of "${title}" by ${artist}?`,
          },
        ],
      }),
    })

    if (!response.ok) return null

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (!content || /unknown/i.test(content)) return null

    const key = standardizeKey(content.replace(/^["']|["']$/g, ''))
    if (!key) return null

    return { key, source: 'openai' }
  } catch {
    return null
  }
}

async function lookupKeyFromGemini(
  artist: string,
  title: string,
): Promise<SongKeyLookupResult | null> {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
  if (!apiKey) return null

  const models = [
    process.env.GEMINI_SONG_KEY_MODEL?.trim(),
    'gemini-2.5-flash',
    'gemini-2.0-flash',
  ].filter((m): m is string => Boolean(m))

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(12_000),
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `What is the original recorded musical key of the song "${title}" by ${artist}? Reply with ONLY a short label like "G major", "A minor", or "F# minor". If unsure, reply "unknown".`,
                  },
                ],
              },
            ],
            generationConfig: { temperature: 0, maxOutputTokens: 20 },
          }),
        },
      )

      if (!response.ok) continue

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
      if (!content || /unknown/i.test(content)) continue

      const key = standardizeKey(content.replace(/^["']|["']$/g, ''))
      if (!key) continue

      return { key, source: 'gemini' }
    } catch {
      /* try next model */
    }
  }

  return null
}

/**
 * Fast fallback when Redis has no crowdsourced key.
 * Prefer Ultimate Guitar tab tonality; optionally use OpenAI / Gemini if configured.
 * Never invents a key — returns null when all sources fail.
 */
export async function lookupSongKey(
  artist: string,
  title: string,
): Promise<SongKeyLookupResult | null> {
  const a = artist.trim()
  const t = title.trim()
  if (!a || !t) return null

  const fromUg = await lookupKeyFromUltimateGuitar(a, t)
  if (fromUg) return fromUg

  const fromOpenAI = await lookupKeyFromOpenAI(a, t)
  if (fromOpenAI) return fromOpenAI

  return lookupKeyFromGemini(a, t)
}
