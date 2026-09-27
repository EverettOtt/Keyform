export type ItunesTrack = {
  trackId: number
  trackName: string
  artistName: string
  collectionName?: string
  artworkUrl100?: string
  previewUrl?: string
  primaryGenreName?: string
  releaseDate?: string
}

type ItunesResponse = { resultCount: number; results: ItunesTrack[] }

/** Strip remaster / deluxe / live / edition noise so duplicates collapse. */
function normalizeTrackNameForMatch(trackName: string) {
  return trackName
    .replace(/\(.*?remaster.*?\)/gi, '')
    .replace(/\(.*?deluxe.*?\)/gi, '')
    .replace(/\(.*?version.*?\)/gi, '')
    .replace(/\(.*?edition.*?\)/gi, '')
    .replace(/\(live.*?\)/gi, '')
    .replace(/\s*-\s*live\b.*/gi, '')
    .replace(/\s*-\s*remastered\b.*/gi, '')
    .replace(/\s*-\s*bonus track\b.*/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeArtistForMatch(artistName: string) {
  return artistName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Keep the first hit for each unique artist + song, dropping alternate
 * album editions / remasters that share the same core title.
 */
export function deduplicateSearchResults(results: ItunesTrack[]): ItunesTrack[] {
  const seen = new Set<string>()
  const unique: ItunesTrack[] = []

  for (const track of results) {
    const key = `${normalizeArtistForMatch(track.artistName)}:${normalizeTrackNameForMatch(track.trackName)}`
    if (!key || key === ':' || seen.has(key)) continue
    seen.add(key)
    unique.push(track)
  }

  return unique
}

export function searchUrl(term: string) {
  // Fetch extras so dedupe still leaves a useful list for the UI.
  return `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=25`
}

export async function fetchTracks(url: string): Promise<ItunesTrack[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Search failed')
  const data: ItunesResponse = await res.json()
  const valid = data.results.filter((t) => t.trackId && t.trackName)
  return deduplicateSearchResults(valid)
}

export function artwork(track: ItunesTrack, size = 300) {
  return track.artworkUrl100?.replace('100x100bb', `${size}x${size}bb`)
}
