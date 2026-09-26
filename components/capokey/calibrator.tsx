'use client'

import { useEffect, useId, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Mars, Play, TriangleAlert, Venus, Volume2, X } from 'lucide-react'
import { playNote } from '@/lib/audio'
import {
  MAX_MIDI,
  MIN_MIDI,
  VOICE_CATEGORIES,
  closestVoicePart,
  formatRange,
  midiToFreq,
  midiToName,
  type VocalRange,
  type VoiceCategory,
} from '@/lib/music'
import { cn } from '@/lib/utils'

type Phase = 'finding_lowest' | 'finding_highest' | 'complete'
type Response = 'tooLow' | 'comfortable' | 'strained' | 'tooHigh'
type Voice = 'male' | 'female'

type TestState = {
  phase: Phase
  baseline: number
  currentNote: number
  /** Last note marked comfortable or strained (reachable edge while probing). */
  lastReachableNote: number | null
  comfortableLow: number | null
  comfortableHigh: number | null
  lowestNote: number | null
  highestNote: number | null
  /** Note marked too low — shown as a red end on the range bar. */
  rejectedLow: number | null
  /** Note marked too high — shown as a red end on the range bar. */
  rejectedHigh: number | null
  notesTested: number
}

type ResultsState = {
  range: VocalRange
  comfortable: VocalRange
  selectedPart: VoiceCategory | null
  closestPart: VoiceCategory
  label: string
}

const clamp = (m: number) => Math.min(MAX_MIDI, Math.max(MIN_MIDI, m))

function rangeMidpoint(range: VocalRange) {
  return clamp(Math.round((range.low + range.high) / 2))
}

/** Middle of the selected choir part, or baritone/mezzo for male/female-only. */
function startingNoteFor(voice: Voice, part: VoiceCategory | null) {
  const fallbackId = voice === 'male' ? 'baritone' : 'mezzo'
  const cat = part ?? VOICE_CATEGORIES.find((c) => c.id === fallbackId)
  return cat ? rangeMidpoint(cat.range) : clamp(48)
}

function initialTest(startNote: number): TestState {
  const start = clamp(startNote)
  return {
    phase: 'finding_lowest',
    baseline: start,
    currentNote: start,
    lastReachableNote: null,
    comfortableLow: null,
    comfortableHigh: null,
    lowestNote: null,
    highestNote: null,
    rejectedLow: null,
    rejectedHigh: null,
    notesTested: 1,
  }
}

function withComfortable(s: TestState, note: number): Pick<TestState, 'comfortableLow' | 'comfortableHigh'> {
  return {
    comfortableLow: s.comfortableLow === null ? note : Math.min(s.comfortableLow, note),
    comfortableHigh: s.comfortableHigh === null ? note : Math.max(s.comfortableHigh, note),
  }
}

function lockLowest(s: TestState, lowestNote: number): TestState {
  const low = clamp(lowestNote)
  const highStart = clamp(Math.max(s.baseline, low))
  return {
    ...s,
    phase: 'finding_highest',
    lowestNote: low,
    lastReachableNote: null,
    currentNote: highStart,
    notesTested: s.notesTested + 1,
  }
}

function lockHighest(s: TestState, highestNote: number): TestState {
  const high = clamp(highestNote)
  const low = s.lowestNote ?? high
  return { ...s, phase: 'complete', highestNote: Math.max(high, low) }
}

function transition(s: TestState, response: Response): TestState {
  if (s.phase === 'finding_lowest') {
    if (response === 'tooLow') {
      const rejectedLow = s.currentNote
      if (s.lastReachableNote === null) {
        const bumped = clamp(s.currentNote + 5)
        return {
          ...s,
          rejectedLow,
          baseline: bumped,
          currentNote: bumped,
          lastReachableNote: null,
          lowestNote: null,
          notesTested: s.notesTested + 1,
        }
      }
      return { ...lockLowest(s, s.lastReachableNote), rejectedLow }
    }

    if (response === 'comfortable' || response === 'strained') {
      const comfort = response === 'comfortable' ? withComfortable(s, s.currentNote) : {}
      const next = s.currentNote - 1
      if (next < MIN_MIDI) {
        return lockLowest({ ...s, ...comfort, lastReachableNote: s.currentNote }, s.currentNote)
      }
      return {
        ...s,
        ...comfort,
        lastReachableNote: s.currentNote,
        currentNote: next,
        notesTested: s.notesTested + 1,
      }
    }

    return s
  }

  if (s.phase === 'finding_highest') {
    if (response === 'tooHigh') {
      const rejectedHigh = s.currentNote
      if (s.lastReachableNote === null) {
        const floor = s.lowestNote ?? MIN_MIDI
        const dropped = clamp(Math.max(s.currentNote - 5, floor))
        if (dropped === s.currentNote) {
          return { ...lockHighest(s, s.currentNote), rejectedHigh }
        }
        return {
          ...s,
          rejectedHigh,
          currentNote: dropped,
          lastReachableNote: null,
          notesTested: s.notesTested + 1,
        }
      }
      return { ...lockHighest(s, s.lastReachableNote), rejectedHigh }
    }

    if (response === 'comfortable' || response === 'strained') {
      const comfort = response === 'comfortable' ? withComfortable(s, s.currentNote) : {}
      const next = s.currentNote + 1
      if (next > MAX_MIDI) {
        return lockHighest({ ...s, ...comfort, lastReachableNote: s.currentNote }, s.currentNote)
      }
      return {
        ...s,
        ...comfort,
        lastReachableNote: s.currentNote,
        currentNote: next,
        notesTested: s.notesTested + 1,
      }
    }

    return s
  }

  return s
}

export type Stage = 'setup' | 'testing'

export type CalibratorResult = {
  range: VocalRange
  comfortable: VocalRange
  label: string
}

type CalibratorProps = {
  onComplete: (result: CalibratorResult) => void
  onStageChange?: (stage: Stage) => void
}

const PARTS_BY_VOICE: Record<Voice, string[]> = {
  male: ['bass', 'baritone', 'tenor'],
  female: ['alto', 'mezzo', 'soprano'],
}

function partsFor(voice: Voice) {
  return PARTS_BY_VOICE[voice]
    .map((id) => VOICE_CATEGORIES.find((c) => c.id === id))
    .filter((c): c is VoiceCategory => Boolean(c))
}

export function Calibrator({ onComplete, onStageChange }: CalibratorProps) {
  const [voice, setVoice] = useState<Voice>('male')
  const [part, setPart] = useState<VoiceCategory | null>(null)
  const [test, setTest] = useState<TestState | null>(null)
  const [results, setResults] = useState<ResultsState | null>(null)

  const category = part ?? VOICE_CATEGORIES.find((c) => c.id === voice) ?? null
  const label = category?.label ?? 'Singer'

  function start() {
    const next = initialTest(startingNoteFor(voice, part))
    setTest(next)
    onStageChange?.('testing')
    playNote(next.currentNote)
  }

  function exitTest() {
    setTest(null)
    onStageChange?.('setup')
  }

  function respond(response: Response) {
    if (!test) return
    const next = transition(test, response)
    if (next.phase === 'complete' && next.lowestNote !== null && next.highestNote !== null) {
      const range = { low: next.lowestNote, high: next.highestNote }
      const comfortable = {
        low: next.comfortableLow ?? range.low,
        high: next.comfortableHigh ?? range.high,
      }
      if (comfortable.low > comfortable.high) {
        comfortable.low = range.low
        comfortable.high = range.high
      }
      const closest = closestVoicePart(range)
      setTest(null)
      setResults({
        range,
        comfortable,
        selectedPart: part,
        closestPart: closest,
        label: closest.label,
      })
      return
    }
    setTest(next)
    playNote(next.currentNote)
  }

  function finishResults() {
    if (!results) return
    const { range, comfortable, label: resultLabel } = results
    setResults(null)
    onComplete({ range, comfortable, label: resultLabel })
  }

  if (results) {
    return <ResultsPopup results={results} onContinue={finishResults} />
  }

  if (test) {
    return <TestStep test={test} label={label} onRespond={respond} onBack={exitTest} />
  }

  return (
    <SetupStep
      voice={voice}
      part={part}
      onVoice={(v) => {
        setVoice(v)
        setPart(null)
      }}
      onPart={setPart}
      onStart={start}
      label={label}
    />
  )
}

function ResultsPopup({ results, onContinue }: { results: ResultsState; onContinue: () => void }) {
  const titleId = useId()
  const mismatch =
    results.selectedPart !== null && results.selectedPart.id !== results.closestPart.id

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter') onContinue()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onContinue])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/75 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onContinue}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-card p-6 shadow-2xl sm:max-h-[85dvh] sm:p-8',
          'animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300',
        )}
      >
        <button
          type="button"
          onClick={onContinue}
          aria-label="Close"
          className="absolute top-4 right-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Range found</p>
        <h2 id={titleId} className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          Nice work!
        </h2>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          Search for any song below to match it to your voice.
        </p>

        <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-5 text-center">
          <p className="text-xs uppercase tracking-widest text-primary/80">Your range</p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-tight sm:text-4xl">
            {formatRange(results.range)}
          </p>
          <p className="mt-2 text-sm font-medium text-primary">{results.closestPart.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {midiToName(results.range.low)} to {midiToName(results.range.high)}
          </p>
          {(results.comfortable.low !== results.range.low ||
            results.comfortable.high !== results.range.high) && (
            <p className="mt-3 text-xs text-amber-200/90">
              Comfortable: {formatRange(results.comfortable)} · yellow edges are strained
            </p>
          )}
        </div>

        {mismatch ? (
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Nice discovery — your tested range fits{' '}
            <span className="font-semibold text-primary">{results.closestPart.label}</span> best. We&apos;ll match
            songs to that.
          </p>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            Your tested range fits{' '}
            <span className="font-medium text-foreground">{results.closestPart.label}</span>.
          </p>
        )}

        <button
          type="button"
          onClick={onContinue}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-base"
        >
          Continue to songs
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function SetupStep({
  voice,
  part,
  onVoice,
  onPart,
  onStart,
  label,
}: {
  voice: Voice
  part: VoiceCategory | null
  onVoice: (v: Voice) => void
  onPart: (p: VoiceCategory | null) => void
  onStart: () => void
  label: string
}) {
  const voices: { id: Voice; label: string; Icon: typeof Mars }[] = [
    { id: 'male', label: 'Male', Icon: Mars },
    { id: 'female', label: 'Female', Icon: Venus },
  ]

  return (
    <section className="flex w-full min-w-0 flex-col" aria-labelledby="setup-heading">
      <h1 id="setup-heading" className="text-balance text-2xl font-semibold tracking-tight sm:text-4xl">
        Find your range.
      </h1>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
        Take this quick test so we can match songs to your voice.
      </p>

      <h2 className="mt-8 text-sm text-muted-foreground sm:text-base">Voice</h2>
      <div className="mt-3 grid w-full grid-cols-2 gap-3" role="radiogroup" aria-label="Voice">
        {voices.map(({ id, label: vLabel, Icon }) => {
          const active = voice === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onVoice(id)}
              className={cn(
                'flex w-full min-w-0 items-center gap-3 rounded-2xl border px-3 py-4 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-4 sm:text-base',
                active ? 'border-primary bg-primary/10' : 'border-white/10 bg-card hover:border-white/20',
              )}
            >
              <Icon className={cn('size-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
              {vLabel}
            </button>
          )
        })}
      </div>

      <div className="mt-8 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium sm:text-base">Vocal part (optional)</h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">If you know your vocal part, select it here.</p>
        </div>
        {part && (
          <button
            type="button"
            onClick={() => onPart(null)}
            className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      <div className="mt-3 grid w-full grid-cols-3 gap-2 sm:gap-3" role="radiogroup" aria-label="Vocal part">
        {partsFor(voice).map((p) => {
          const active = part?.id === p.id
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onPart(active ? null : p)}
              className={cn(
                'flex w-full min-w-0 flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-4',
                active ? 'border-primary bg-primary/10 ring-2 ring-primary/40' : 'border-white/10 bg-card hover:border-white/20',
              )}
            >
              <span className="text-sm font-bold sm:text-base">{p.label}</span>
              <span className="text-xs text-slate-400">{p.description}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onStart}
        className="mt-10 flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-base"
      >
        Start range test as {label}
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </section>
  )
}

const LOW_RESPONSES: { id: Response; label: string; Icon: typeof Check; tone: 'red' | 'amber' | 'primary' }[] = [
  { id: 'tooLow', label: 'Too Low', Icon: ArrowDown, tone: 'red' },
  { id: 'strained', label: 'Strained', Icon: TriangleAlert, tone: 'amber' },
  { id: 'comfortable', label: 'Comfortable', Icon: Check, tone: 'primary' },
]

const HIGH_RESPONSES: { id: Response; label: string; Icon: typeof Check; tone: 'red' | 'amber' | 'primary' }[] = [
  { id: 'comfortable', label: 'Comfortable', Icon: Check, tone: 'primary' },
  { id: 'strained', label: 'Strained', Icon: TriangleAlert, tone: 'amber' },
  { id: 'tooHigh', label: 'Too High', Icon: ArrowUp, tone: 'red' },
]

function TestStep({
  test,
  label,
  onRespond,
  onBack,
}: {
  test: TestState
  label: string
  onRespond: (r: Response) => void
  onBack: () => void
}) {
  const [played, setPlayed] = useState<number | null>(test.currentNote)
  const hasPlayed = played === test.currentNote
  const isLow = test.phase === 'finding_lowest'

  const pct = (m: number) => ((m - MIN_MIDI) / (MAX_MIDI - MIN_MIDI)) * 100

  // Full reachable span so far (comfortable + strained).
  let fullLow: number | null = null
  let fullHigh: number | null = null
  if (isLow) {
    if (test.lastReachableNote !== null) {
      fullLow = Math.min(test.lastReachableNote, test.currentNote)
      fullHigh = Math.max(test.baseline, test.lastReachableNote, test.currentNote)
    }
  } else if (test.lowestNote !== null) {
    fullLow = test.lowestNote
    const highBound = test.lastReachableNote ?? test.currentNote
    fullHigh = Math.max(fullLow, highBound, test.currentNote)
  }

  const comfortLow = test.comfortableLow
  const comfortHigh = test.comfortableHigh
  const hasComfort =
    comfortLow !== null && comfortHigh !== null && comfortHigh >= comfortLow
  const hasFull = fullLow !== null && fullHigh !== null && fullHigh >= fullLow
  const hasStrain =
    hasFull &&
    hasComfort &&
    (comfortLow! > fullLow! || comfortHigh! < fullHigh!)

  function play() {
    playNote(test.currentNote)
    setPlayed(test.currentNote)
  }

  return (
    <section className="flex w-full min-w-0 flex-col" aria-labelledby="test-heading">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Back
        </button>
      </div>

      <p className="mt-6 text-sm font-medium text-primary">
        Step {isLow ? 1 : 2} of 2 · {label}
      </p>
      <h1 id="test-heading" className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-4xl">
        {isLow ? 'Find your lowest note' : 'Find your highest note'}
      </h1>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
        Play the note, sing along, and tell us how it feels. Mark strained notes in yellow — the test ends when you hit
        too low or too high.
      </p>

      <div className="mt-6 w-full min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-card p-4 sm:p-6">
        <div className="flex flex-col items-center py-2">
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Current note</span>
          <span
            key={test.currentNote}
            className="animate-in fade-in zoom-in-95 mt-2 text-5xl font-bold tracking-tight duration-300 sm:text-7xl"
            aria-live="polite"
          >
            {midiToName(test.currentNote)}
          </span>
          <span className="mt-2 font-mono text-sm text-muted-foreground">
            {midiToFreq(test.currentNote).toFixed(1)} Hz
          </span>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            onClick={play}
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label={hasPlayed ? 'Play note again' : 'Play note'}
          >
            {hasPlayed ? <Volume2 className="size-6" /> : <Play className="size-6 fill-current" />}
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-2 flex-1 rounded-full',
                  i % 3 === 0 && 'h-3',
                  hasPlayed ? 'bg-primary/40' : 'bg-white/10',
                )}
              />
            ))}
          </div>
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {hasPlayed ? 'Sing along, then choose below' : 'Tap play to hear the note'}
        </p>
      </div>

      <div className="mt-6 w-full">
        <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground sm:text-sm">
          <span className="min-w-0 truncate">Range so far</span>
          <span className="shrink-0 font-mono">
            {hasFull ? `${midiToName(fullLow!)} - ${midiToName(fullHigh!)}` : '- - -'}
          </span>
        </div>
        <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          {hasStrain && (
            <span
              className="absolute inset-y-0 rounded-full bg-amber-400/70"
              style={{
                left: `${pct(fullLow!)}%`,
                width: `${Math.max(pct(fullHigh!) - pct(fullLow!), 0)}%`,
              }}
            />
          )}
          {hasComfort && (
            <span
              className="absolute inset-y-0 rounded-full bg-emerald-500/80"
              style={{
                left: `${pct(comfortLow!)}%`,
                width: `${Math.max(pct(comfortHigh!) - pct(comfortLow!), 0)}%`,
              }}
            />
          )}
          {!hasComfort && hasFull && (
            <span
              className="absolute inset-y-0 rounded-full bg-amber-400/70"
              style={{
                left: `${pct(fullLow!)}%`,
                width: `${Math.max(pct(fullHigh!) - pct(fullLow!), 0)}%`,
              }}
            />
          )}
          {/* Red ends when Too low / Too high was pressed */}
          {test.rejectedLow !== null && hasFull && (
            <span
              className="absolute inset-y-0 w-2.5 rounded-l-full bg-rose-500"
              style={{ left: `${pct(fullLow!)}%` }}
              title={`Too low: ${midiToName(test.rejectedLow)}`}
            />
          )}
          {test.rejectedLow !== null && !hasFull && (
            <span
              className="absolute inset-y-0 w-2.5 rounded-full bg-rose-500"
              style={{ left: `${pct(test.rejectedLow)}%`, transform: 'translateX(-50%)' }}
              title={`Too low: ${midiToName(test.rejectedLow)}`}
            />
          )}
          {test.rejectedHigh !== null && hasFull && (
            <span
              className="absolute inset-y-0 w-2.5 rounded-r-full bg-rose-500"
              style={{ left: `calc(${pct(fullHigh!)}% - 10px)` }}
              title={`Too high: ${midiToName(test.rejectedHigh)}`}
            />
          )}
          {test.rejectedHigh !== null && !hasFull && (
            <span
              className="absolute inset-y-0 w-2.5 rounded-full bg-rose-500"
              style={{ left: `${pct(test.rejectedHigh)}%`, transform: 'translateX(-50%)' }}
              title={`Too high: ${midiToName(test.rejectedHigh)}`}
            />
          )}
          <span
            className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary transition-[left]"
            style={{ left: `${pct(test.currentNote)}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground sm:text-sm">
          <span>
            {test.notesTested} {test.notesTested === 1 ? 'note' : 'notes'} tested
          </span>
          <span className="flex items-center gap-1.5">
            {isLow ? <ArrowDown className="size-4" aria-hidden="true" /> : <ArrowUp className="size-4" aria-hidden="true" />}
            Moving {isLow ? 'down' : 'up'} by half steps
          </span>
        </div>
      </div>

      <div className="mt-8 grid w-full grid-cols-3 gap-2 sm:gap-3">
        {(isLow ? LOW_RESPONSES : HIGH_RESPONSES).map(({ id, label: rLabel, Icon, tone }) => (
          <button
            key={id}
            type="button"
            onClick={() => onRespond(id)}
            className={cn(
              'flex w-full min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border px-1.5 py-4 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-2 sm:py-5 sm:text-sm',
              tone === 'primary' &&
                'border-primary bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-primary',
              tone === 'amber' &&
                'border-amber-400/50 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25 focus-visible:outline-amber-400',
              tone === 'red' &&
                'border-rose-500/50 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 focus-visible:outline-rose-400',
            )}
          >
            <Icon className="size-5 sm:size-6" aria-hidden="true" />
            {rLabel}
          </button>
        ))}
      </div>
    </section>
  )
}
