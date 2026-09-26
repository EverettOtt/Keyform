'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  Flag,
  Guitar,
  Info,
  Minus,
  Plus,
  Sparkles,
  Star,
  TriangleAlert,
  Volume2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { playSequence, unlockMobileAudio } from '@/lib/audio'
import { fetchSongKey } from '@/lib/getsongkey'
import { artwork, type ItunesTrack } from '@/lib/itunes'
import {
  capoOptions,
  estimateSong,
  evaluateFit,
  fitSeverity,
  formatKeyLabel,
  formatRange,
  melodyRange,
  parseKey,
  findBestVocalFit,
  transposeKey,
  type SongKey,
  type VocalRange,
} from '@/lib/music'
import { getMelodyRangeForKey, noteNameToMidi, resolveSongData } from '@/lib/range-calculator'
import {
  isSongSaved,
  removeSavedSong,
  upsertSavedSong,
} from '@/lib/storage'
import { cn } from '@/lib/utils'
import { KeySelect } from './key-select'
import { RangeBar } from './range-bar'

const glass = 'rounded-3xl border border-white/10 bg-card/50 backdrop-blur-xl'

type MelodyMeta = {
  range: VocalRange
  isEstimated: boolean
}

type KeySource = 'api' | 'fallback' | 'community'

type MatchDashboardProps = {
  track: ItunesTrack
  range: VocalRange
  comfortable?: VocalRange
  onBack: () => void
  initialPlayInKey?: string
  initialOctaveShift?: number
  initialVoiceCalibrated?: boolean
  onSavedSongsChange?: () => void
}


function tonicDelta(from: SongKey, to: SongKey) {
  let d = to.tonic - from.tonic
  if (d > 6) d -= 12
  if (d < -6) d += 12
  return d
}

function melodyFromNotes(lowNote: string, highNote: string): VocalRange | null {
  const low = noteNameToMidi(lowNote)
  const high = noteNameToMidi(highNote)
  if (low === null || high === null) return null
  return { low, high: Math.max(high, low) }
}


export function MatchDashboard({
  track,
  range,
  comfortable = range,
  onBack,
  initialPlayInKey,
  initialOctaveShift = 0,
  initialVoiceCalibrated = false,
  onSavedSongsChange,
}: MatchDashboardProps) {
  const estimate = estimateSong(track.trackId)
  const initialPlayKey = (initialPlayInKey && parseKey(initialPlayInKey)) || estimate.key
  /** Published key from GetSongKEY / song DB / community correction — not changed by play-in. */
  const [originalKey, setOriginalKey] = useState<SongKey>(estimate.key)
  /** User-selected key for transposition / capo (defaults to originalKey). */
  const [selectedKey, setSelectedKey] = useState<SongKey>(initialPlayKey)
  const [keySource, setKeySource] = useState<KeySource>('fallback')
  const [isCommunityCorrected, setIsCommunityCorrected] = useState(false)
  const [melodyMeta, setMelodyMeta] = useState<MelodyMeta | null>(null)
  const [octaveShift, setOctaveShift] = useState(initialOctaveShift)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [saved, setSaved] = useState(() => isSongSaved(track.trackId))
  const [voiceCalibrated, setVoiceCalibrated] = useState(initialVoiceCalibrated)
  const communityCorrectedRef = useRef(false)
  const playInOverrideRef = useRef(initialPlayInKey)
  const playInLockedRef = useRef(Boolean(initialPlayInKey))

  useEffect(() => {
    playInOverrideRef.current = initialPlayInKey
    playInLockedRef.current = Boolean(initialPlayInKey)
  }, [initialPlayInKey, track.trackId])

  useEffect(() => {
    let cancelled = false
    communityCorrectedRef.current = false
    setIsCommunityCorrected(false)
    setOctaveShift(initialOctaveShift)
    setCorrectionOpen(false)
    setSaved(isSongSaved(track.trackId))
    setVoiceCalibrated(initialVoiceCalibrated)

    function applyResolved(apiKey: SongKey, source: Exclude<KeySource, 'community'>) {
      if (cancelled || communityCorrectedRef.current) return
      const resolved = resolveSongData(track.trackName, track.artistName, formatKeyLabel(apiKey))
      const parsed = parseKey(resolved.key) ?? apiKey
      const rangeNotes = melodyFromNotes(resolved.lowNote, resolved.highNote)
      if (!rangeNotes) return

      setOriginalKey(parsed)
      setKeySource(source)
      setMelodyMeta({
        range: rangeNotes,
        isEstimated: resolved.isEstimated,
      })

      if (playInOverrideRef.current) {
        setSelectedKey(parseKey(playInOverrideRef.current) ?? parsed)
      } else if (!playInLockedRef.current) {
        setSelectedKey(parsed)
        setOctaveShift(0)
      }
    }

    applyResolved(estimateSong(track.trackId).key, 'fallback')

    fetchSongKey(track.trackName, track.artistName)
      .then((key) => {
        if (!cancelled && key) applyResolved(key, 'api')
      })
      .catch(() => {
        /* keep DB / estimate already applied */
      })

    return () => {
      cancelled = true
    }
  }, [track.trackId, track.trackName, track.artistName, initialOctaveShift, initialVoiceCalibrated, range])

  function toggleSaveSong() {
    if (saved) {
      removeSavedSong(track.trackId)
      setSaved(false)
    } else {
      const primaryCapo = capoOptions(selectedKey)[0]
      upsertSavedSong({
        songId: track.trackId,
        title: track.trackName,
        artist: track.artistName,
        playInKey: formatKeyLabel(selectedKey),
        octaveShift,
        capoFret: primaryCapo?.fret ?? 0,
        voiceCalibrated,
        artworkUrl100: track.artworkUrl100,
        previewUrl: track.previewUrl,
        collectionName: track.collectionName,
      })
      setSaved(true)
    }
    onSavedSongsChange?.()
  }

  async function submitKeyCorrection(corrected: SongKey) {
    communityCorrectedRef.current = true
    setIsCommunityCorrected(true)
    setKeySource('community')
    setOriginalKey(corrected)
    setSelectedKey(corrected)

    const estimated = getMelodyRangeForKey(formatKeyLabel(corrected))
    const rangeNotes = melodyFromNotes(estimated.lowNote, estimated.highNote)
    if (rangeNotes) {
      setMelodyMeta({ range: rangeNotes, isEstimated: true })
    }

    setCorrectionOpen(false)

    try {
      await fetch('/api/songs/correct-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: track.trackName,
          artist: track.artistName,
          correctedKey: formatKeyLabel(corrected),
        }),
      })
    } catch {
      /* placeholder endpoint — local state already updated */
    }
  }

  function calibrateToVoice(melody: VocalRange, baseKey: SongKey) {
    playInOverrideRef.current = undefined
    playInLockedRef.current = true

    if (voiceCalibrated) {
      setSelectedKey(baseKey)
      setOctaveShift(0)
      setVoiceCalibrated(false)
      return
    }

    const best = findBestVocalFit(range, melody)
    setSelectedKey(transposeKey(baseKey, best.shift))
    setOctaveShift(best.octaveShift)
    setVoiceCalibrated(true)
  }

  function setPlayInKey(key: SongKey) {
    playInOverrideRef.current = undefined
    playInLockedRef.current = true
    setVoiceCalibrated(false)
    setSelectedKey(key)
  }

  function setPlayOctave(value: number) {
    playInOverrideRef.current = undefined
    playInLockedRef.current = true
    setVoiceCalibrated(false)
    setOctaveShift(value)
  }

  const playShift = tonicDelta(originalKey, selectedKey)
  const octaveSemitones = octaveShift * 12
  const melodyAtOriginal = melodyMeta?.range ?? melodyRange(originalKey, estimate.span)
  const melodyAtPlayKey = {
    low: melodyAtOriginal.low + playShift + octaveSemitones,
    high: melodyAtOriginal.high + playShift + octaveSemitones,
  }
  const isEstimated = melodyMeta?.isEstimated ?? true

  const fit = evaluateFit(range, melodyAtPlayKey, false, 0)
  const suggestion = findBestVocalFit(range, melodyAtOriginal)
  const suggestedKey = transposeKey(originalKey, suggestion.shift)
  const severityInfo = fitSeverity(comfortable, range, fit.sung)

  const capos = capoOptions(selectedKey)
  const art = artwork(track, 300)


  const keyBadge =
    keySource === 'community' || isCommunityCorrected
      ? { label: 'Community Verified', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' }
      : keySource === 'api'
        ? { label: 'API', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
        : null

  return (
    <section aria-labelledby="match-heading" className="mx-auto w-full min-w-0 max-w-md space-y-4 md:max-w-2xl lg:max-w-4xl">
      <Button variant="ghost" size="sm" onClick={onBack} className="self-start -ml-2">
        <ArrowLeft /> Back to home
      </Button>

      <div className={cn(glass, 'flex w-full min-w-0 flex-col gap-5 overflow-hidden p-4 sm:flex-row sm:items-center sm:p-5')}>
        {art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art}
            alt={`${track.collectionName ?? track.trackName} album cover`}
            width={112}
            height={112}
            className="size-28 shrink-0 rounded-lg object-cover shadow-2xl"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="match-heading" className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
                {track.trackName}
              </h2>
              <p className="text-muted-foreground">
                {track.artistName}
                {track.collectionName && <span className="text-muted-foreground/70"> · {track.collectionName}</span>}
              </p>
            </div>
            <button
              type="button"
              aria-label={saved ? 'Remove from Songbook' : 'Save to Songbook'}
              title={saved ? 'Remove from Songbook' : 'Save to Songbook'}
              onClick={toggleSaveSong}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400',
                saved
                  ? 'border-amber-400/40 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
                  : 'border-white/10 bg-white/[0.04] text-muted-foreground hover:border-amber-400/30 hover:bg-amber-400/10 hover:text-amber-300',
              )}
            >
              <Star className="size-4" aria-hidden="true" fill={saved ? 'currentColor' : 'none'} />
              <span className="hidden sm:inline">{saved ? 'Saved ✓' : 'Save'}</span>
            </button>
          </div>
          {track.previewUrl && (
            <audio controls src={track.previewUrl} className="mt-3 h-9 w-full max-w-sm" preload="none">
              <track kind="captions" />
            </audio>
          )}
        </div>
      </div>

      <CompatibilityBadge
        severity={severityInfo}
        voiceCalibrated={voiceCalibrated}
        melodyWiderThanVoice={melodyAtOriginal.high - melodyAtOriginal.low > range.high - range.low}
        suggestedKeyLabel={formatKeyLabel(suggestedKey)}
        calibratedKeyLabel={formatKeyLabel(selectedKey)}
        onCalibrate={() => calibrateToVoice(melodyAtOriginal, originalKey)}
      />

      <div className={cn(glass, 'flex w-full min-w-0 flex-col gap-5 overflow-hidden p-4 sm:p-5')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Original key</p>
            <div className="mt-1.5 flex min-h-8 flex-wrap items-center gap-2">
              <p className="font-mono text-lg font-semibold tracking-tight">{formatKeyLabel(originalKey)}</p>
              {keyBadge && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    keyBadge.className,
                  )}
                >
                  {keySource === 'community' ? <CircleCheck className="size-3" aria-hidden="true" /> : null}
                  {keyBadge.label}
                </span>
              )}
              <button
                type="button"
                aria-label="Fix wrong key"
                title="Fix wrong key"
                onClick={() => setCorrectionOpen(true)}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-400 transition-colors hover:bg-rose-500/20 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
              >
                <Flag className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Range
              {isEstimated && <span className="normal-case tracking-normal"> (estimated)</span>}
            </p>
            <div className="mt-1.5 flex min-h-8 items-center justify-end gap-1.5">
              <button
                type="button"
                aria-label="Hear melody range"
                title="Hear melody range"
                onClick={async () => {
                  await unlockMobileAudio()
                  playSequence([fit.sung.low, fit.sung.high])
                }}
                className="inline-flex size-8 items-center justify-center rounded-lg text-cyan-400 transition-colors hover:bg-cyan-400/10 hover:text-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              >
                <Volume2 className="size-4" aria-hidden="true" />
              </button>
              <p className="font-mono text-lg font-semibold tracking-tight">{formatRange(fit.base)}</p>
              {isEstimated && (
                <button
                  type="button"
                  aria-label="Flag incorrect range"
                  title="Coming soon — submit verified high and low notes"
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-400 transition-colors hover:bg-rose-500/20 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                >
                  <Flag className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 items-start gap-3">
          <div className="min-w-0">
            <label
              htmlFor="play-in-key"
              className="block h-4 text-xs leading-4 uppercase tracking-widest text-muted-foreground"
            >
              Play in key
            </label>
            <div className="mt-1.5">
              <KeySelect
                id="play-in-key"
                value={selectedKey}
                onChange={setPlayInKey}
                aria-label="Play in key"
                className="h-10 w-full justify-between"
              />
            </div>
          </div>

          <OctaveStepper value={octaveShift} onChange={setPlayOctave} />
        </div>

        <RangeBar
          user={range}
          comfortable={comfortable}
          original={fit.base}
          sung={fit.sung}
          severity={severityInfo.severity}
        />
      </div>

      <CapoBanner capos={capos} />

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {isEstimated
          ? 'Melody range is estimated from the original key. Use Play in key and Octave Change to transpose — capo and range update instantly.'
          : 'Melody range verified from our song database. Use Play in key and Octave Change to transpose — capo and range update instantly.'}
      </p>

      {correctionOpen && (
        <KeyCorrectionModal
          currentKey={originalKey}
          onClose={() => setCorrectionOpen(false)}
          onSubmit={submitKeyCorrection}
        />
      )}
    </section>
  )
}

function KeyCorrectionModal({
  currentKey,
  onClose,
  onSubmit,
}: {
  currentKey: SongKey
  onClose: () => void
  onSubmit: (key: SongKey) => void | Promise<void>
}) {
  const titleId = useId()
  const [draftKey, setDraftKey] = useState<SongKey>(currentKey)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit(draftKey)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            Submit Key Correction
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-amber-200/90">
          You are flagging the database key as incorrect. Changing this will submit a community fix that updates the
          official song key for all Keyform users.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <div>
            <label htmlFor="correction-key" className="text-xs uppercase tracking-widest text-muted-foreground">
              Corrected key
            </label>
            <div className="mt-1.5">
              <KeySelect
                id="correction-key"
                value={draftKey}
                onChange={setDraftKey}
                aria-label="Corrected key"
              />
            </div>
          </div>

          <Button type="submit" disabled={submitting} className="w-full justify-center py-3">
            {submitting ? 'Submitting…' : 'Submit Correction for Everyone'}
          </Button>
        </form>
      </div>
    </div>
  )
}

function CompatibilityBadge({
  severity: info,
  voiceCalibrated,
  melodyWiderThanVoice,
  suggestedKeyLabel,
  calibratedKeyLabel,
  onCalibrate,
}: {
  severity: ReturnType<typeof fitSeverity>
  voiceCalibrated: boolean
  melodyWiderThanVoice: boolean
  suggestedKeyLabel: string
  calibratedKeyLabel: string
  onCalibrate: () => void
}) {
  const { severity, offBy, direction } = info

  let label: string
  let detail: string
  let Icon: typeof CircleCheck
  let className: string
  let buttonClass: string

  if (severity === 'comfortable') {
    Icon = CircleCheck
    className = 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
    buttonClass =
      'border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 focus-visible:outline-emerald-400'
    label = 'Comfortable Fit'
    detail = 'The melody sits inside your comfortable range in this play-in key.'
  } else if (severity === 'strained') {
    Icon = TriangleAlert
    className = 'bg-amber-950/40 border-amber-500/40 text-amber-300'
    buttonClass =
      'border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 focus-visible:outline-amber-400'
    label = 'Strained Range'
    detail = voiceCalibrated
      ? 'Best available match still uses your strained range — reachable, but not fully comfortable.'
      : 'The melody fits your strained range — you can reach it, but it sits outside your comfortable zone.'
  } else {
    Icon = CircleX
    className = 'bg-rose-950/40 border-rose-500/40 text-rose-300'
    buttonClass =
      'border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 focus-visible:outline-rose-400'
    label = voiceCalibrated ? 'Best Available Match' : 'Out of Range'
    detail = voiceCalibrated
      ? melodyWiderThanVoice
        ? `This melody is wider than your voice, so a perfect fit isn’t possible. Still ${offBy} semitone${offBy === 1 ? '' : 's'} ${direction}.`
        : `Closest reachable match is still ${offBy} semitone${offBy === 1 ? '' : 's'} ${direction}. Try adjusting Play in key or Octave.`
      : `Out of Range: This song is ${offBy} semitone${offBy === 1 ? '' : 's'} outside your full range in this play-in key. Tap “Calibrate to your voice” or try another key.`
  }

  if (!voiceCalibrated) {
    buttonClass =
      'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 focus-visible:outline-sky-400'
  }

  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col gap-4 rounded-3xl border p-5 backdrop-blur-xl transition-colors sm:gap-5 sm:p-6',
        className,
      )}
      role="status"
    >
      <div className="flex min-w-0 items-start gap-4">
        <Icon className="mt-0.5 size-8 shrink-0 sm:size-9" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold sm:text-xl">{label}</p>
          <p className="mt-1.5 text-sm leading-relaxed opacity-90 sm:text-base">{detail}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onCalibrate}
        className={cn(
          'flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-base',
          buttonClass,
        )}
      >
        <Sparkles className="size-4 shrink-0 sm:size-5" aria-hidden="true" />
        <span className="min-w-0 truncate">
          {voiceCalibrated
            ? `Calibrated · ${calibratedKeyLabel} · tap to reset`
            : `Calibrate to your voice → ${suggestedKeyLabel}`}
        </span>
      </button>
    </div>
  )
}

function CapoBanner({ capos }: { capos: ReturnType<typeof capoOptions> }) {
  const [best, alt] = capos
  if (!best) return null

  const primary =
    best.fret === 0 ? `No capo (${best.shapeName} shapes)` : `Capo ${best.fret} (${best.shapeName} shapes)`

  return (
    <div className={cn(glass, 'flex w-full min-w-0 flex-col gap-4 overflow-hidden p-4 sm:p-5')}>
      <div className="flex items-center gap-2">
        <Guitar className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold tracking-tight sm:text-base">Guitar chords</h3>
      </div>

      <div className="rounded-2xl border border-primary/25 bg-primary/10 px-4 py-4">
        <p className="text-base font-semibold text-primary sm:text-lg">{primary}</p>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Chord shapes to play">
          {best.chords.map((c) => (
            <li
              key={c}
              className="rounded-lg border border-white/10 bg-background/50 px-3 py-1.5 font-mono text-sm font-medium"
            >
              {c}
            </li>
          ))}
        </ul>
      </div>

      {alt && (
        <p className="text-sm text-muted-foreground">
          Alt:{' '}
          <span className="font-medium text-foreground/80">
            {alt.fret === 0 ? 'no capo' : `capo ${alt.fret}`} ({alt.shapeName}
            {alt.chords.length ? ` · ${alt.chords.join(' ')}` : ''})
          </span>
        </p>
      )}
    </div>
  )
}

function OctaveStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const label = value === 0 ? '0' : value > 0 ? `+${value}` : `${value}`

  return (
    <div className="min-w-0">
      <p className="block h-4 text-xs leading-4 uppercase tracking-widest text-muted-foreground">Octave</p>
      <div
        className="mt-1.5 box-border flex h-10 w-full items-center justify-between rounded-xl border border-white/10 bg-background/60 px-1"
        role="group"
        aria-label="Octave change"
      >
        <button
          type="button"
          aria-label="Decrease octave"
          disabled={value <= -2}
          onClick={() => onChange(Math.max(-2, value - 1))}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <span
          className="min-w-0 flex-1 truncate px-1 text-center text-sm font-medium leading-none tabular-nums"
          aria-live="polite"
        >
          {label}
        </span>
        <button
          type="button"
          aria-label="Increase octave"
          disabled={value >= 2}
          onClick={() => onChange(Math.min(2, value + 1))}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
