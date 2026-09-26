'use client'

import { useCallback, useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { ItunesTrack } from '@/lib/itunes'
import { midiToName, type VocalRange } from '@/lib/music'
import {
  clearVocalRange,
  loadSavedSongs,
  loadVocalRange,
  removeSavedSong,
  saveVocalRange,
  type SavedSong,
} from '@/lib/storage'
import { cn } from '@/lib/utils'
import { Calibrator, type Stage } from './calibrator'
import { Header } from './header'
import { MatchDashboard } from './match-dashboard'
import { Songbook } from './songbook'
import { SongSearch } from './song-search'

type Calibrated = { range: VocalRange; comfortable: VocalRange; label: string }

type SelectedSong = {
  track: ItunesTrack
  playInKey?: string
  octaveShift?: number
  voiceCalibrated?: boolean
}

export function AppShell() {
  const [ready, setReady] = useState(false)
  const [calibrated, setCalibrated] = useState<Calibrated | null>(null)
  const [stage, setStage] = useState<Stage>('setup')
  const [selected, setSelected] = useState<SelectedSong | null>(null)
  const [savedSongs, setSavedSongs] = useState<SavedSong[]>([])

  useEffect(() => {
    const stored = loadVocalRange()
    if (stored) setCalibrated(stored)
    setSavedSongs(loadSavedSongs())
    setReady(true)
  }, [])

  const isCalibrating = !calibrated

  function finishCalibration({ range, comfortable, label }: { range: VocalRange; comfortable: VocalRange; label: string }) {
    saveVocalRange(range, label, comfortable)
    setCalibrated({ range, comfortable, label })
  }

  function retakeVocalTest() {
    clearVocalRange()
    setCalibrated(null)
    setSelected(null)
    setStage('setup')
  }

  function openSavedSong(song: SavedSong) {
    setSelected({
      track: {
        trackId: song.songId,
        trackName: song.title,
        artistName: song.artist,
        artworkUrl100: song.artworkUrl100,
        previewUrl: song.previewUrl,
        collectionName: song.collectionName,
      },
      playInKey: song.playInKey,
      octaveShift: song.octaveShift,
      voiceCalibrated: song.voiceCalibrated === true,
    })
  }

  function handleRemoveSaved(songId: number) {
    removeSavedSong(songId)
    setSavedSongs(loadSavedSongs())
  }

  const refreshSavedSongs = useCallback(() => {
    setSavedSongs(loadSavedSongs())
  }, [])

  const step = calibrated ? 2 : stage === 'testing' ? 1 : 0

  if (!ready) {
    return (
      <div className="min-h-dvh w-full overflow-x-hidden">
        <Header step={0} isCalibrating />
      </div>
    )
  }

  return (
    <div className="min-h-dvh w-full overflow-x-hidden">
      <Header step={step} isCalibrating={isCalibrating} />
      <main className="mx-auto w-full max-w-md overflow-x-hidden px-4 pt-4 pb-12 md:max-w-2xl lg:max-w-4xl">
        {isCalibrating ? (
          <Calibrator onComplete={finishCalibration} onStageChange={setStage} />
        ) : selected ? (
          <MatchDashboard
            key={`${selected.track.trackId}-${selected.playInKey ?? ''}-${selected.octaveShift ?? 0}-${selected.voiceCalibrated ? 'c' : 'u'}`}
            track={selected.track}
            range={calibrated.range}
            comfortable={calibrated.comfortable}
            initialPlayInKey={selected.playInKey}
            initialOctaveShift={selected.octaveShift}
            initialVoiceCalibrated={selected.voiceCalibrated}
            onBack={() => setSelected(null)}
            onSavedSongsChange={refreshSavedSongs}
          />
        ) : (
          <div className="flex w-full min-w-0 flex-col gap-8">
            <RangeBadge {...calibrated} onRetake={retakeVocalTest} />
            <Songbook songs={savedSongs} onOpen={openSavedSong} onRemove={handleRemoveSaved} />
            <SongSearch
              range={calibrated.range}
              selectedId={null}
              onSelect={(track) => setSelected({ track })}
            />
          </div>
        )}
      </main>
    </div>
  )
}

function RangeBadge({
  range,
  comfortable,
  label,
  onRetake,
}: Calibrated & { onRetake: () => void }) {
  const comfort = comfortable ?? range
  const hasStrain = comfort.low > range.low || comfort.high < range.high
  const pad = 2
  const min = Math.min(range.low, comfort.low) - pad
  const max = Math.max(range.high, comfort.high) + pad
  const total = Math.max(max - min, 1)
  const pos = (m: number) => `${((m - min) / total) * 100}%`
  const width = (lo: number, hi: number) => `${((Math.max(hi, lo) - lo) / total) * 100}%`

  const labels = hasStrain
    ? [
        { midi: range.low, tone: 'amber' as const },
        { midi: comfort.low, tone: 'emerald' as const },
        { midi: comfort.high, tone: 'emerald' as const },
        { midi: range.high, tone: 'amber' as const },
      ]
    : [
        { midi: range.low, tone: 'emerald' as const },
        { midi: range.high, tone: 'emerald' as const },
      ]

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 rounded-3xl border border-white/10 bg-card px-4 py-5 sm:px-5 sm:py-6">
      <p className="text-center text-sm font-medium tracking-tight sm:text-base">
        Your Range - {label}
      </p>
      <div
        className="relative mt-1 h-3 w-full overflow-hidden rounded-full bg-white/[0.06]"
        role="img"
        aria-label={`Your range ${midiToName(range.low)} to ${midiToName(range.high)}${
          hasStrain
            ? `, comfortable ${midiToName(comfort.low)} to ${midiToName(comfort.high)}`
            : ''
        }`}
      >
        {hasStrain && (
          <span
            className="absolute inset-y-0 rounded-full bg-amber-400/55"
            style={{ left: pos(range.low), width: width(range.low, range.high) }}
          />
        )}
        <span
          className="absolute inset-y-0 rounded-full bg-emerald-500/80"
          style={{ left: pos(comfort.low), width: width(comfort.low, comfort.high) }}
        />
      </div>
      <div className="relative mb-1 h-4 w-full font-mono text-[10px] sm:text-[11px]">
        {labels.map(({ midi, tone }, i) => (
          <span
            key={`${midi}-${i}`}
            className={cn(
              'absolute -translate-x-1/2',
              tone === 'emerald' ? 'text-emerald-400' : 'text-amber-300/90',
            )}
            style={{ left: pos(midi) }}
          >
            {midiToName(midi)}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onRetake}
        className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-2.5 text-xs font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm"
      >
        <RotateCcw className="size-3.5" aria-hidden="true" />
        Retake Vocal Test
      </button>
    </div>
  )
}
