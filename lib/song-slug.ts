/** Strip remaster / deluxe / live / edition noise before slugifying. */
function stripVersionNoise(value: string) {
  return value
    .replace(/\(.*?remaster.*?\)/gi, '')
    .replace(/\(.*?deluxe.*?\)/gi, '')
    .replace(/\(.*?version.*?\)/gi, '')
    .replace(/\(.*?edition.*?\)/gi, '')
    .replace(/\(live.*?\)/gi, '')
    .replace(/\s*-\s*live\b.*/gi, '')
    .replace(/\s*-\s*remastered\b.*/gi, '')
    .replace(/\s*-\s*bonus track\b.*/gi, '')
}

/** Normalize one side of a song slug (artist or title). */
export function normalizeSlugPart(value: string): string {
  return stripVersionNoise(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Canonical song slug: `artist-name:song-title`
 * Used as the global key-database identity across all users.
 */
export function songSlug(artist: string, title: string): string {
  return `${normalizeSlugPart(artist)}:${normalizeSlugPart(title)}`
}
