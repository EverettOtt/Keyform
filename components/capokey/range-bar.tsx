import { midiToName, type FitSeverity, type VocalRange } from '@/lib/music'
import { cn } from '@/lib/utils'

const SONG_BAND: Record<FitSeverity, string> = {
  comfortable: 'bg-emerald-500/80',
  strained: 'bg-amber-400/80',
  out: 'bg-rose-500',
}

type RangeBarProps = {
  user: VocalRange
  /** Comfortable (non-strained) subset of `user`. Defaults to full `user`. */
  comfortable?: VocalRange
  original: VocalRange
  sung: VocalRange
  severity: FitSeverity
}

export function RangeBar({
  user,
  comfortable = user,
  original,
  sung,
  severity,
}: RangeBarProps) {
  const min = Math.min(user.low, comfortable.low, original.low, sung.low) - 2
  const max = Math.max(user.high, comfortable.high, original.high, sung.high) + 2
  const total = max - min
  const pos = (m: number) => `${((m - min) / total) * 100}%`
  const width = (lo: number, hi: number) => `${((Math.max(hi, lo) - lo) / total) * 100}%`
  const cs = Array.from({ length: total + 1 }, (_, i) => min + i).filter((m) => m % 12 === 0)

  const hasStrain = comfortable.low > user.low || comfortable.high < user.high

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="sr-only">
        Your range {midiToName(user.low)} to {midiToName(user.high)}. Song melody sung at {midiToName(sung.low)} to{' '}
        {midiToName(sung.high)}.
      </figcaption>

      <Row label="You">
        {hasStrain && (
          <div
            className="absolute inset-y-0 rounded-full bg-amber-400/55"
            style={{ left: pos(user.low), width: width(user.low, user.high) }}
            title="Includes strained notes"
          />
        )}
        <div
          className="absolute inset-y-0 rounded-full bg-emerald-500/80"
          style={{ left: pos(comfortable.low), width: width(comfortable.low, comfortable.high) }}
          title="Comfortable range"
        />
      </Row>

      <Row label="Song">
        <div
          className={cn('absolute inset-y-0 rounded-full transition-all duration-500', SONG_BAND[severity])}
          style={{ left: pos(sung.low), width: width(sung.low, sung.high) }}
        />
      </Row>

      <div className="relative ml-14 h-4 overflow-hidden font-mono text-[10px] text-muted-foreground" aria-hidden="true">
        {cs.map((m) => (
          <span key={m} className="absolute -translate-x-1/2" style={{ left: pos(m) }}>
            {midiToName(m)}
          </span>
        ))}
      </div>
    </figure>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3" aria-hidden="true">
      <span className="w-11 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.04]">{children}</div>
    </div>
  )
}
