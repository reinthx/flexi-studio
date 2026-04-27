export interface AbilityAssetInfo {
  iconSrc: string
  recastMs?: number
}

const abilityInfoCache = new Map<string, AbilityAssetInfo>()
const pendingAbilityInfoRequests = new Map<string, Promise<AbilityAssetInfo>>()
const STORAGE_KEY = 'flexi-studio-ability-info-cache-v1'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30
const NEGATIVE_CACHE_TTL_MS = 1000 * 60 * 60 * 24
const REQUEST_INTERVAL_MS = 500
const MAX_REQUESTS_PER_SESSION = 80

type StoredAbilityCache = Record<string, { info: AbilityAssetInfo; at: number }>

const requestQueue: Array<() => void> = []
let queueRunning = false
let requestCount = 0
let storedCacheLoaded = false

function loadStoredCache(): void {
  if (storedCacheLoaded || typeof localStorage === 'undefined') return
  storedCacheLoaded = true
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredAbilityCache
    const now = Date.now()
    for (const [abilityId, entry] of Object.entries(parsed)) {
      const ttl = entry.info?.iconSrc || entry.info?.recastMs ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS
      if (entry && entry.info && now - entry.at <= ttl) {
        abilityInfoCache.set(abilityId, entry.info)
      }
    }
  } catch {
    /* ignore corrupt icon cache */
  }
}

function persistAbilityInfo(abilityId: string, info: AbilityAssetInfo): void {
  if (typeof localStorage === 'undefined') return
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredAbilityCache
    parsed[abilityId] = { info, at: Date.now() }
    const entries = Object.entries(parsed)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 500)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* storage can be full or unavailable in some CEF contexts */
  }
}

function scheduleRequest<T>(task: () => Promise<T>): Promise<T> {
  return new Promise(resolve => {
    requestQueue.push(() => {
      task().then(resolve)
    })
    runQueue()
  })
}

function runQueue(): void {
  if (queueRunning) return
  queueRunning = true
  const runNext = () => {
    const next = requestQueue.shift()
    if (!next) {
      queueRunning = false
      return
    }
    next()
    globalThis.setTimeout(runNext, REQUEST_INTERVAL_MS)
  }
  runNext()
}

function actionRowIdFromAbilityId(abilityId: string): number | null {
  if (!abilityId || abilityId.startsWith('dot:')) return null
  const cleaned = abilityId.trim()
  if (!/^[0-9a-f]+$/i.test(cleaned)) return null
  const parsed = parseInt(cleaned, 16)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function iconAssetUrl(iconId: number): string {
  const padded = String(iconId).padStart(6, '0')
  const folder = `${padded.slice(0, 3)}000`
  const path = `ui/icon/${folder}/${padded}_hr1.tex`
  return `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(path)}&format=png`
}

const EMPTY_ABILITY_INFO: AbilityAssetInfo = { iconSrc: '' }

export function abilityInitials(name: unknown): string {
  const words = Array.from(String(name ?? '').matchAll(/[\p{L}\p{N}'-]+/gu), match => match[0])
    .filter(word => !/^[ivxlcdm]+$/i.test(word))
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

export async function resolveAbilityInfo(abilityId: string): Promise<AbilityAssetInfo> {
  loadStoredCache()
  if (abilityInfoCache.has(abilityId)) return abilityInfoCache.get(abilityId) ?? EMPTY_ABILITY_INFO
  if (pendingAbilityInfoRequests.has(abilityId)) return pendingAbilityInfoRequests.get(abilityId)!

  const rowId = actionRowIdFromAbilityId(abilityId)
  const networkDisabled = typeof localStorage !== 'undefined' && localStorage.getItem('flexi-studio-disable-xivapi-icons') === 'true'
  if (!rowId || typeof fetch === 'undefined' || networkDisabled || requestCount >= MAX_REQUESTS_PER_SESSION) {
    abilityInfoCache.set(abilityId, EMPTY_ABILITY_INFO)
    return EMPTY_ABILITY_INFO
  }

  requestCount++
  const request = scheduleRequest(() => fetch(`https://v2.xivapi.com/api/sheet/Action/${rowId}?fields=${encodeURIComponent('Icon@as(raw),Recast100ms')}`))
    .then(async response => {
      if (!response.ok) return EMPTY_ABILITY_INFO
      const data = await response.json()
      const rawIcon = data?.fields?.['Icon@as(raw)']
      const iconId = typeof rawIcon === 'number' ? rawIcon : parseInt(String(rawIcon ?? ''), 10)
      const rawRecast = data?.fields?.Recast100ms
      const recast100ms = typeof rawRecast === 'number' ? rawRecast : parseInt(String(rawRecast ?? ''), 10)
      const info: AbilityAssetInfo = {
        iconSrc: Number.isFinite(iconId) && iconId > 0 ? iconAssetUrl(iconId) : '',
      }
      if (Number.isFinite(recast100ms) && recast100ms > 0) {
        info.recastMs = recast100ms * 100
      }
      return info
    })
    .catch(() => EMPTY_ABILITY_INFO)
    .then(info => {
      abilityInfoCache.set(abilityId, info)
      persistAbilityInfo(abilityId, info)
      pendingAbilityInfoRequests.delete(abilityId)
      return info
    })

  pendingAbilityInfoRequests.set(abilityId, request)
  return request
}

export async function resolveAbilityIconSrc(abilityId: string): Promise<string> {
  return (await resolveAbilityInfo(abilityId)).iconSrc
}
