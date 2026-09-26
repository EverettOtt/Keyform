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

export function searchUrl(term: string) {
  return `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8`
}

export async function fetchTracks(url: string): Promise<ItunesTrack[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Search failed')
  const data: ItunesResponse = await res.json()
  return data.results.filter((t) => t.trackId && t.trackName)
}

export function artwork(track: ItunesTrack, size = 300) {
  return track.artworkUrl100?.replace('100x100bb', `${size}x${size}bb`)
}
