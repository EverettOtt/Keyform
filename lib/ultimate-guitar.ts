import { formatKeyLabel, type SongKey } from '@/lib/music'

/**
 * Ultimate Guitar search / affiliate link helper.
 * Returns a direct UG search URL until Awin affiliate wrapping is approved.
 */
export function getUGAffiliateLink(artist: string, song: string): string {
  const baseUrl = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(
    `${artist} ${song}`,
  )}`

  // TODO: Wrap with Awin affiliate link when approved (Publisher ID: YOUR_AWIN_ID)
  // return `https://www.awin1.com/cread.php?awinmid=123984&awinaffid=YOUR_AWIN_ID&ued=${encodeURIComponent(baseUrl)}`;

  return baseUrl
}

/**
 * Semitone shift from original → target, normalized into Ultimate Guitar's
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
  headline: string
  badge: string
  steps: string
  capoTip: string | null
}

/** Human-readable Ultimate Guitar transpose + optional capo instructions. */
export function getUgTransposeGuide(original: SongKey, target: SongKey): UgTransposeGuide {
  const shift = ugTransposeShift(original, target)
  const signed = shift > 0 ? `+${shift}` : `${shift}`

  if (shift === 0) {
    return {
      shift,
      headline: 'No transposition needed (Play in Original Key)',
      badge: 'UG Transpose: 0 semitones',
      steps: 'Open the chord sheet below — no Transpose change is needed.',
      capoTip: null,
    }
  }

  return {
    shift,
    headline: `Set Transpose to ${signed} on Ultimate Guitar`,
    badge: `UG Transpose: ${signed} semitone${Math.abs(shift) === 1 ? '' : 's'}`,
    steps: `Open the chord sheet below, tap Transpose at the bottom of the page, and set it to ${signed}.`,
    capoTip:
      shift > 0
        ? `Or put Capo on Fret ${shift} and play in key of ${formatKeyLabel(original)}`
        : null,
  }
}
