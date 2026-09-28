import { formatKeyLabel, type SongKey } from '@/lib/music'

/** Filtered UG search (Chords) — used when we can't resolve a direct tab. */
export function getUgSearchUrl(artist: string, song: string): string {
  const value = encodeURIComponent(`${artist} ${song}`.trim())
  return `https://www.ultimate-guitar.com/search.php?search_type=title&value=${value}&type%5B0%5D=Chords`
}

/**
 * Client link that hits our resolver so users land on the best chords tab
 * instead of UG's search box. Affiliate wrapping can still wrap this later.
 */
export function getUGAffiliateLink(artist: string, song: string): string {
  const params = new URLSearchParams({ artist, title: song })
  return `/api/ug-tab?${params.toString()}`
}

/**
 * Shift from original → play-in key, normalized into Ultimate Guitar's
 * typical transpose UI range of -6…+6.
 */
export function ugTransposeShift(original: SongKey, target: SongKey): number {
  let shift = target.tonic - original.tonic
  if (shift > 6) shift -= 12
  if (shift < -6) shift += 12
  return shift
}

export type UgTransposeGuide = {
  shift: number
  /** Single primary line — the only place the shift amount appears. */
  title: string
  detail: string
  capoTip: string | null
}

/** Human-readable Ultimate Guitar transpose + optional capo instructions. */
export function getUgTransposeGuide(original: SongKey, target: SongKey): UgTransposeGuide {
  const shift = ugTransposeShift(original, target)
  const signed = shift > 0 ? `+${shift}` : `${shift}`

  if (shift === 0) {
    return {
      shift,
      title: 'Leave Transpose at 0',
      detail: 'Open the chord sheet and play in the original key.',
      capoTip: null,
    }
  }

  return {
    shift,
    title: `Set Transpose to ${signed}`,
    detail: 'Open the chord sheet and use the Transpose control at the bottom.',
    capoTip: shift > 0 ? `Or capo fret ${shift} and play in ${formatKeyLabel(original)}` : null,
  }
}
