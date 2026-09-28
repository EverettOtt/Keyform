'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { ChevronRight, Loader2, Music2, Search } from 'lucide-react'
import { artwork, type ItunesTrack } from '@/lib/itunes'
import type { VocalRange } from '@/lib/music'
import { cn } from '@/lib/utils'

/** Curated top guitar + singing songs shown before a search. Iris is always #1. */
const POPULAR_SONGS: { title: string; artist: string }[] = [
  { title: 'Iris', artist: 'Goo Goo Dolls' },
  { title: 'Wonderwall', artist: 'Oasis' },
  { title: 'Riptide', artist: 'Vance Joy' },
  { title: 'Hallelujah', artist: 'Jeff Buckley' },
  { title: 'Let It Be', artist: 'The Beatles' },
  { title: 'Perfect', artist: 'Ed Sheeran' },
  { title: "I'm Yours", artist: 'Jason Mraz' },
  { title: 'Hey There Delilah', artist: "Plain White T's" },
  { title: 'Fast Car', artist: 'Tracy Chapman' },
  { title: 'Blackbird', artist: 'The Beatles' },
  { title: 'Wish You Were Here', artist: 'Pink Floyd' },
  { title: 'Hotel California', artist: 'Eagles' },
  { title: 'Creep', artist: 'Radiohead' },
  { title: 'Free Fallin\'', artist: 'Tom Petty' },
  { title: 'Thinking Out Loud', artist: 'Ed Sheeran' },
]

type SongSearchProps = {
  range: VocalRange
  selectedId: number | null
  onSelect: (track: ItunesTrack) => void
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function fetchSearchResults(term: string): Promise<ItunesTrack[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`)
  if (!res.ok) throw new Error('Search failed')
  const data = (await res.json()) as { results?: ItunesTrack[]; error?: string }
  if (!Array.isArray(data.results)) throw new Error(data.error || 'Search failed')
  return data.results
}

async function fetchPopularTracks(): Promise<ItunesTrack[]> {
  const tracks = await Promise.all(
    POPULAR_SONGS.map(async ({ title, artist }) => {
      try {
        const results = await fetchSearchResults(`${title} ${artist}`)
        const wantTitle = normalize(title)
        const wantArtist = normalize(artist)
        const match =
          results.find(
            (t) =>
              normalize(t.trackName).includes(wantTitle) &&
              normalize(t.artistName).includes(wantArtist.split(' ')[0] ?? wantArtist),
          ) ??
          results.find((t) => normalize(t.trackName).includes(wantTitle)) ??
          results[0]
        return match ?? null
      } catch {
        return null
      }
    }),
  )
  return tracks.filter((t): t is ItunesTrack => t !== null)
}

export function SongSearch({ selectedId, onSelect }: SongSearchProps) {
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setTerm(query.trim()), 350)
    return () => clearTimeout(id)
  }, [query])

  const searching = term.length >= 2

  const { data, error, isLoading } = useSWR(searching ? `search:${term}` : null, () => fetchSearchResults(term), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  const {
    data: popular,
    error: popularError,
    isLoading: popularLoading,
  } = useSWR(!searching ? 'keyform-popular-songs' : null, fetchPopularTracks, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  return (
    <section aria-labelledby="search-heading" className="flex w-full min-w-0 flex-col gap-4">
      <div>
        <h2 id="search-heading" className="text-xl font-semibold tracking-tight sm:text-3xl">
          Any song. Any key.
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Search any song to match it to your voice.</p>
      </div>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          setTerm(query.trim())
        }}
        className="relative"
      >
        <label htmlFor="song-query" className="sr-only">
          Song or artist
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="song-query"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Song title or artist…"
          autoComplete="off"
          className="h-14 w-full min-w-0 rounded-2xl border border-white/10 bg-card/50 pr-12 pl-12 text-sm backdrop-blur-xl transition-colors outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-4 focus:ring-primary/15 sm:text-base"
        />
        {isLoading && searching && (
          <Loader2
            className="absolute top-1/2 right-4 size-5 -translate-y-1/2 animate-spin text-primary"
            aria-label="Searching"
          />
        )}
      </form>

      {!searching ? (
        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h3 className="text-sm font-semibold tracking-tight">Top Songs</h3>
          </div>
          {popularLoading && !popular ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
              Loading popular songs…
            </div>
          ) : popularError ? (
            <p className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger" role="alert">
              Couldn&apos;t load popular songs. Check your connection and try again.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Top songs">
              {popular?.map((track, index) => (
                <li key={track.trackId}>
                  <SongRow
                    track={track}
                    rank={index + 1}
                    selected={track.trackId === selectedId}
                    onSelect={() => onSelect(track)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : error ? (
        <p className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger" role="alert">
          {"Couldn't reach the song catalog. Check your connection and try again."}
        </p>
      ) : data && data.length === 0 ? (
        <p className="rounded-2xl border border-white/10 p-6 text-center text-sm text-muted-foreground">
          No songs found for &ldquo;{term}&rdquo;.
        </p>
      ) : (
        <ul className={cn('flex flex-col gap-2 transition-opacity', isLoading && 'opacity-60')} aria-live="polite">
          {data?.map((track) => (
            <li key={track.trackId}>
              <SongRow
                track={track}
                selected={track.trackId === selectedId}
                onSelect={() => onSelect(track)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SongRow({
  track,
  rank,
  selected,
  onSelect,
}: {
  track: ItunesTrack
  rank?: number
  selected: boolean
  onSelect: () => void
}) {
  const art = artwork(track, 120)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group flex w-full min-w-0 items-center gap-3 rounded-2xl border p-2.5 text-left text-sm backdrop-blur-xl transition-all focus-visible:outline-2 focus-visible:outline-primary sm:text-base',
        selected
          ? 'border-primary/50 bg-primary/10'
          : 'border-white/10 bg-card/40 hover:border-white/20 hover:bg-card/70',
      )}
    >
      {typeof rank === 'number' && (
        <span
          className={cn(
            'w-6 shrink-0 text-center font-mono text-sm tabular-nums',
            rank === 1 ? 'font-semibold text-primary' : 'text-muted-foreground',
          )}
          aria-hidden="true"
        >
          {rank}
        </span>
      )}
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art}
          alt=""
          width={56}
          height={56}
          className="size-14 shrink-0 rounded-md object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted">
          <Music2 className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{track.trackName}</p>
        <p className="truncate text-sm text-muted-foreground">{track.artistName}</p>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  )
}
