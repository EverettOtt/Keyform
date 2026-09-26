'use client'

import { BookMarked, Star } from 'lucide-react'
import { formatKeyLabel, parseKey } from '@/lib/music'
import type { SavedSong } from '@/lib/storage'
import { cn } from '@/lib/utils'

type SongbookProps = {
  songs: SavedSong[]
  onOpen: (song: SavedSong) => void
  onRemove: (songId: number) => void
}

export function Songbook({ songs, onOpen, onRemove }: SongbookProps) {
  if (songs.length === 0) return null

  return (
    <section aria-labelledby="songbook-heading" className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <BookMarked className="size-4 text-primary" aria-hidden="true" />
        <h2 id="songbook-heading" className="text-sm font-semibold tracking-tight">
          My Songbook
        </h2>
        <span className="text-xs text-muted-foreground">({songs.length})</span>
      </div>

      <ul className="flex w-full min-w-0 flex-col gap-2">
        {songs.map((song) => {
          const key = parseKey(song.playInKey)
          const keyLabel = key ? formatKeyLabel(key) : song.playInKey
          const octave =
            song.octaveShift === 0
              ? null
              : song.octaveShift > 0
                ? `+${song.octaveShift} oct`
                : `${song.octaveShift} oct`
          const capo = song.capoFret === 0 ? 'No capo' : `Capo ${song.capoFret}`

          return (
            <li key={song.songId}>
              <div
                className={cn(
                  'flex w-full min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-card/50 px-3 py-3 backdrop-blur-xl transition-colors',
                  'hover:border-white/20 hover:bg-card/80',
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpen(song)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {song.artworkUrl100 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={song.artworkUrl100}
                      alt=""
                      width={44}
                      height={44}
                      className="size-11 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-white/5">
                      <Star className="size-4 text-amber-400" aria-hidden="true" fill="currentColor" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{song.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {[keyLabel, octave, capo].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${song.title} from songbook`}
                  onClick={() => onRemove(song.songId)}
                  className="shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Remove
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
