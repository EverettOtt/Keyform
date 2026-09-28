'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  ExternalLink,
  Flag,
  Guitar,
  Info,
  Loader2,
  Minus,
  Plus,
  Sparkles,
  Star,
  TriangleAlert,
  Volume2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { playSequence } from '@/lib/audio'
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
import { noteNameToMidi, resolveSongData } from '@/lib/range-calculator'
import { songSlug } from '@/lib/song-slug'
import { isSongSaved, removeSavedSong, upsertSavedSong } from '@/lib/storage'
import { getUGAffiliateLink, getUgTransposeGuide } from '@/lib/ultimate-guitar'
import { cn } from '@/lib/utils'
import { KeySelect } from './key-select'
import { RangeBar } from './range-bar'

const glass = 'rounded-3xl border border-white/10 bg-card/50 backdrop-blur-xl'

type MelodyMeta = {
  range: VocalRange
  isEstimated: boolean
}

type KeyLookupStatus = 'loading' | 'saved' | 'missing'

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
  const slug = songSlug(track.artistName, track.trackName)
  const ugLink = getUGAffiliateLink(track.artistName, track.trackName)

  /** Crowdsourced / verified original song key — not changed by play-in. */
  const [originalKey, setOriginalKey] = useState<SongKey | null>(null)
  /** User-selected key for transposition / capo (defaults to originalKey). */
  const [selectedKey, setSelectedKey] = useState<SongKey>(initialPlayKey)
  const [keyStatus, setKeyStatus] = useState<KeyLookupStatus>('loading')
  const [melodyMeta, setMelodyMeta] = useState<MelodyMeta | null>(null)
  const [octaveShift, setOctaveShift] = useState(initialOctaveShift)
  const [saved, setSaved] = useState(() => isSongSaved(track.trackId))
  const [voiceCalibrated, setVoiceCalibrated] = useState(initialVoiceCalibrated)
  const [draftKey, setDraftKey] = useState<SongKey>({ tonic: 0, mode: 'major' })
  const [savingKey, setSavingKey] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState(false)
  const [correctingKey, setCorrectingKey] = useState(false)
  const [correctError, setCorrectError] = useState<string | null>(null)
  const playInOverrideRef = useRef(initialPlayInKey)
  const playInLockedRef = useRef(Boolean(initialPlayInKey))

  useEffect(() => {
    playInOverrideRef.current = initialPlayInKey
    playInLockedRef.current = Boolean(initialPlayInKey)
  }, [initialPlayInKey, track.trackId])

  function applyResolved(apiKey: SongKey) {
    const resolved = resolveSongData(track.trackName, track.artistName, formatKeyLabel(apiKey))
    const parsed = parseKey(resolved.key) ?? apiKey
    const rangeNotes = melodyFromNotes(resolved.lowNote, resolved.highNote)
    if (!rangeNotes) return

    setOriginalKey(parsed)
    setKeyStatus('saved')
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

  useEffect(() => {
    let cancelled = false
    setOctaveShift(initialOctaveShift)
    setSaved(isSongSaved(track.trackId))
    setVoiceCalibrated(initialVoiceCalibrated)
    setKeyStatus('loading')
    setOriginalKey(null)
    setMelodyMeta(null)
    setSaveError(null)
    setDraftKey({ tonic: 0, mode: 'major' })
    setEditingKey(false)
    setCorrectError(null)

    fetch(`/api/key?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Key lookup failed')
        return res.json() as Promise<{ found?: boolean; key?: string | null }>
      })
      .then((data) => {
        if (cancelled) return
        const key = data.key ? parseKey(data.key) : null
        if (data.found && key) {
          applyResolved(key)
          return
        }
        setKeyStatus('missing')
        setOriginalKey(null)
        setMelodyMeta(null)
      })
      .catch(() => {
        if (!cancelled) {
          setKeyStatus('missing')
          setOriginalKey(null)
          setMelodyMeta(null)
        }
      })

    return () => {
      cancelled = true
    }
    // applyResolved closes over track fields; slug already encodes artist/title.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.trackId, slug, initialOctaveShift, initialVoiceCalibrated])

  async function saveKeyForEveryone() {
    setSavingKey(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist: track.artistName,
          title: track.trackName,
          key: formatKeyLabel(draftKey),
        }),
      })
      const data = (await res.json()) as { success?: boolean; key?: string; error?: string }
      if (!res.ok || !data.success || !data.key) {
        throw new Error(data.error || 'Could not save key')
      }
      const parsed = parseKey(data.key) ?? draftKey
      applyResolved(parsed)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save key')
    } finally {
      setSavingKey(false)
    }
  }

  async function submitKeyCorrection() {
    setCorrectingKey(true)
    setCorrectError(null)
    try {
      const res = await fetch('/api/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist: track.artistName,
          title: track.trackName,
          key: formatKeyLabel(draftKey),
        }),
      })
      const data = (await res.json()) as { success?: boolean; key?: string; error?: string }
      if (!res.ok || !data.success || !data.key) {
        throw new Error(data.error || 'Could not update key')
      }
      const parsed = parseKey(data.key) ?? draftKey
      playInOverrideRef.current = undefined
      playInLockedRef.current = false
      applyResolved(parsed)
      setEditingKey(false)
    } catch (err) {
      setCorrectError(err instanceof Error ? err.message : 'Could not update key')
    } finally {
      setCorrectingKey(false)
    }
  }

  function openKeyEditor() {
    if (originalKey) setDraftKey(originalKey)
    setCorrectError(null)
    setEditingKey(true)
  }

  function toggleSaveSong() {
    if (saved) {
      removeSavedSong(track.trackId)
      setSaved(false)
    } else {
      const primaryCapo = originalKey ? capoOptions(selectedKey)[0] : null
      upsertSavedSong({
        songId: track.trackId,
        title: track.trackName,
        artist: track.artistName,
        playInKey: originalKey ? formatKeyLabel(selectedKey) : 'Not set',
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

  function calibrateToVoice(melody: VocalRange, baseKey: SongKey) {
    playInOverrideRef.current = undefined
    playInLockedRef.current = true

    if (voiceCalibrated) {
      setSelectedKey(baseKey)
      setOctaveShift(0)
      setVoiceCalibrated(false)
      return
    }

    // Fit to the comfortable range so calibration doesn't sit an octave too low
    // just to use strained notes.
    const best = findBestVocalFit(comfortable, melody)
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

  const art = artwork(track, 300)
  const hasKey = keyStatus === 'saved' && originalKey !== null
  const playShift = hasKey ? tonicDelta(originalKey, selectedKey) : 0
  const octaveSemitones = octaveShift * 12
  const melodyAtOriginal = hasKey
    ? (melodyMeta?.range ?? melodyRange(originalKey, estimate.span))
    : { low: 48, high: 64 }
  const melodyAtPlayKey = {
    low: melodyAtOriginal.low + playShift + octaveSemitones,
    high: melodyAtOriginal.high + playShift + octaveSemitones,
  }
  const isEstimated = melodyMeta?.isEstimated ?? true
  const fit = evaluateFit(range, melodyAtPlayKey, false, 0)
  const suggestion = findBestVocalFit(range, melodyAtOriginal)
  const suggestedKey = hasKey ? transposeKey(originalKey, suggestion.shift) : selectedKey
  const severityInfo = fitSeverity(comfortable, range, fit.sung)

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

      {keyStatus === 'loading' && (
        <div className={cn(glass, 'flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground')}>
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          Looking up the crowd-sourced key…
        </div>
      )}

      {keyStatus === 'missing' && (
        <CrowdsourcePanel
          ugLink={ugLink}
          draftKey={draftKey}
          onDraftKeyChange={setDraftKey}
          saving={savingKey}
          error={saveError}
          onSave={saveKeyForEveryone}
        />
      )}

      {hasKey && originalKey && (
        <>
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
                  <button
                    type="button"
                    aria-label="Flag incorrect key"
                    title="Flag incorrect key"
                    onClick={openKeyEditor}
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
                    onClick={() => playSequence([fit.sung.low, fit.sung.high])}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-cyan-400 transition-colors hover:bg-cyan-400/10 hover:text-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                  >
                    <Volume2 className="size-4" aria-hidden="true" />
                  </button>
                  <p className="font-mono text-lg font-semibold tracking-tight">{formatRange(fit.base)}</p>
                </div>
              </div>
            </div>

            {editingKey && (
              <div className="space-y-3 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-3 sm:p-4">
                <p className="text-sm font-medium text-rose-200">Correct the song key for everyone</p>
                <KeySelect id="correct-key" value={draftKey} onChange={setDraftKey} aria-label="Corrected key" />
                {correctError && (
                  <p className="text-sm text-danger" role="alert">
                    {correctError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={correctingKey} onClick={submitKeyCorrection}>
                    {correctingKey ? 'Saving…' : 'Save corrected key'}
                  </Button>
                  <Button type="button" variant="ghost" disabled={correctingKey} onClick={() => setEditingKey(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

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

          <GuitarChordsCard
            originalKey={originalKey}
            playInKey={selectedKey}
            octaveShift={octaveShift}
            ugLink={ugLink}
          />

          <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Original key is crowdsourced — flag it if it&apos;s wrong so everyone gets the fix. Melody range follows
            the song key. Use Play in key and Octave to transpose — Ultimate Guitar instructions update instantly.
          </p>
        </>
      )}
    </section>
  )
}

function CrowdsourcePanel({
  ugLink,
  draftKey,
  onDraftKeyChange,
  saving,
  error,
  onSave,
}: {
  ugLink: string
  draftKey: SongKey
  onDraftKeyChange: (key: SongKey) => void
  saving: boolean
  error: string | null
  onSave: () => void
}) {
  return (
    <div className={cn(glass, 'flex w-full min-w-0 flex-col gap-5 overflow-hidden p-4 sm:p-5')}>
      <div>
        <p className="text-xs uppercase tracking-widest text-amber-300/90">Not listed</p>
        <h3 className="mt-1.5 text-lg font-semibold tracking-tight">You&apos;re the first person to view this song!</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Look up the tab key on Ultimate Guitar, then save it here so everyone gets accurate capo and vocal fit next
          time.
        </p>
      </div>

      <a
        href={ugLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Check Key on Ultimate Guitar
        <ExternalLink className="size-4 opacity-90" aria-hidden="true" />
      </a>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Key picker</p>
        <KeySelect id="crowd-key" value={draftKey} onChange={onDraftKeyChange} aria-label="Song key" />
      </div>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="button" disabled={saving} onClick={onSave} className="w-full justify-center py-3">
        {saving ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Saving…
          </>
        ) : (
          'Save Key for Everyone'
        )}
      </Button>
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

function GuitarChordsCard({
  originalKey,
  playInKey,
  octaveShift,
  ugLink,
}: {
  originalKey: SongKey
  playInKey: SongKey
  octaveShift: number
  ugLink: string
}) {
  const guide = getUgTransposeGuide(originalKey, playInKey)
  const octaveTip =
    octaveShift === -1
      ? 'Sing down one octave.'
      : octaveShift === -2
        ? 'Sing down two octaves.'
        : octaveShift === 1
          ? 'Sing up one octave.'
          : octaveShift === 2
            ? 'Sing up two octaves.'
            : null

  return (
    <div className={cn(glass, 'flex w-full min-w-0 flex-col gap-4 overflow-hidden p-4 sm:p-5')}>
      <div className="flex items-center gap-2">
        <Guitar className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold tracking-tight sm:text-base">Guitar chords</h3>
      </div>

      <div className="rounded-2xl border border-primary/25 bg-primary/10 px-4 py-4">
        <p className="text-base font-semibold text-primary sm:text-lg">{guide.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">{guide.detail}</p>
        {guide.capoTip && <p className="mt-3 text-sm font-medium text-foreground/90">{guide.capoTip}</p>}
        {octaveTip && <p className="mt-3 text-sm font-medium text-amber-200/95">{octaveTip}</p>}
      </div>

      <a
        href={ugLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Open Chords on Ultimate Guitar
        <ExternalLink className="size-4 opacity-90" aria-hidden="true" />
      </a>
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
