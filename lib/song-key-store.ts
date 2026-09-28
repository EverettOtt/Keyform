import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Redis } from '@upstash/redis'
import { parseKey } from '@/lib/music'

type KeyRecord = {
  key: string
  artist: string
  title: string
  updatedAt: string
}

const KEY_PREFIX = 'songkey:'
const UG_TAB_PREFIX = 'ugtab:'
const FALLBACK_DIR = path.join(process.cwd(), '.data')
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'song-keys.json')
const UG_TAB_FALLBACK_FILE = path.join(FALLBACK_DIR, 'ug-tabs.json')

function redisCredentials() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return { url, token }
}

/** Shared Upstash Redis client for the global song-key database. */
export function getRedis(): Redis | null {
  const creds = redisCredentials()
  if (!creds) return null
  return new Redis(creds)
}

function readFallbackStore(): Record<string, KeyRecord> {
  try {
    if (!existsSync(FALLBACK_FILE)) return {}
    const raw = readFileSync(FALLBACK_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, KeyRecord>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeFallbackStore(store: Record<string, KeyRecord>) {
  if (!existsSync(FALLBACK_DIR)) mkdirSync(FALLBACK_DIR, { recursive: true })
  writeFileSync(FALLBACK_FILE, JSON.stringify(store, null, 2), 'utf8')
}

function isKeyRecord(value: unknown): value is KeyRecord {
  if (!value || typeof value !== 'object') return false
  const rec = value as KeyRecord
  return typeof rec.key === 'string' && Boolean(parseKey(rec.key))
}

/** Only returns keys that someone explicitly saved — never auto-seeds. */
export async function getStoredKey(slug: string): Promise<KeyRecord | null> {
  if (!slug || !slug.includes(':')) return null

  const redis = getRedis()
  if (redis) {
    try {
      const hit = await redis.get<KeyRecord>(`${KEY_PREFIX}${slug}`)
      if (isKeyRecord(hit)) return hit
    } catch {
      /* fall through to file store */
    }
  }

  const local = readFallbackStore()[slug]
  if (local?.key && parseKey(local.key)) return local

  return null
}

export async function setStoredKey(
  slug: string,
  record: Omit<KeyRecord, 'updatedAt'> & { updatedAt?: string },
): Promise<KeyRecord> {
  const next: KeyRecord = {
    key: record.key,
    artist: record.artist,
    title: record.title,
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  }

  const redis = getRedis()
  if (redis) {
    try {
      await redis.set(`${KEY_PREFIX}${slug}`, next)
      return next
    } catch {
      /* fall through to local file store */
    }
  }

  const store = readFallbackStore()
  store[slug] = next
  writeFallbackStore(store)
  return next
}

function readUgTabFallbackStore(): Record<string, string> {
  try {
    if (!existsSync(UG_TAB_FALLBACK_FILE)) return {}
    const raw = readFileSync(UG_TAB_FALLBACK_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeUgTabFallbackStore(store: Record<string, string>) {
  if (!existsSync(FALLBACK_DIR)) mkdirSync(FALLBACK_DIR, { recursive: true })
  writeFileSync(UG_TAB_FALLBACK_FILE, JSON.stringify(store, null, 2), 'utf8')
}

/** Cached Ultimate Guitar chords tab URL for a song slug. */
export async function getCachedUgTabUrl(slug: string): Promise<string | null> {
  if (!slug || !slug.includes(':')) return null

  const redis = getRedis()
  if (redis) {
    try {
      const hit = await redis.get<string>(`${UG_TAB_PREFIX}${slug}`)
      if (typeof hit === 'string' && hit.includes('tabs.ultimate-guitar.com/tab/')) return hit
    } catch {
      /* fall through */
    }
  }

  const local = readUgTabFallbackStore()[slug]
  return typeof local === 'string' && local.includes('/tab/') ? local : null
}

export async function setCachedUgTabUrl(slug: string, tabUrl: string): Promise<void> {
  if (!slug || !tabUrl.includes('tabs.ultimate-guitar.com/tab/')) return

  const redis = getRedis()
  if (redis) {
    try {
      await redis.set(`${UG_TAB_PREFIX}${slug}`, tabUrl)
      return
    } catch {
      /* fall through */
    }
  }

  const store = readUgTabFallbackStore()
  store[slug] = tabUrl
  writeUgTabFallbackStore(store)
}
