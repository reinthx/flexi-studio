import { ref } from 'vue'
import type { CastEvent, CombatantAbilityData, DeathEvent } from '@shared/configSchema'
import { resolveAbilityInfo } from '@shared/abilityIcons'
import type { BreakdownEventRow } from './types'
import type { AbilityBreakdownRow } from './abilityRows'
import type { CastTimelineRow } from './castTimeline'

type AbilityInfoResolver = (abilityId: string) => Promise<{ iconSrc?: string; recastMs?: number }>

export type VisibleAbilityIconSources = {
  abilities: AbilityBreakdownRow[]
  takenAbilities: AbilityBreakdownRow[]
  healingAbilities: AbilityBreakdownRow[]
  eventRows: BreakdownEventRow[]
  deathHitLog: DeathEvent[]
  allData: Record<string, CombatantAbilityData>
  damageTakenData: Record<string, CombatantAbilityData>
  healingReceivedData: Record<string, CombatantAbilityData>
  castData: Record<string, CastEvent[]>
}

export function abilityIconKey(abilityId: string, abilityName: string): string {
  return `${abilityId || 'unknown'}:${abilityName}`
}

export function safeAbilityIconSrc(iconSrc: unknown): string {
  if (typeof iconSrc !== 'string') return ''
  const src = iconSrc.trim()
  if (!src) return ''
  if (src.startsWith('/') && !src.startsWith('//')) return src

  try {
    const url = new URL(src)
    if (
      url.protocol === 'https:' &&
      url.hostname === 'v2.xivapi.com' &&
      url.pathname === '/api/asset' &&
      url.searchParams.get('format') === 'png'
    ) {
      return src
    }
  } catch {
    return ''
  }

  return ''
}

export function abilityIdForName(
  abilityName: string,
  abilityDataSources: Array<Record<string, CombatantAbilityData>>,
  castData: Record<string, CastEvent[]>,
): string {
  for (const source of abilityDataSources) {
    for (const actorData of Object.values(source)) {
      for (const ability of Object.values(actorData)) {
        if (ability.abilityName === abilityName) return ability.abilityId
      }
    }
  }
  for (const events of Object.values(castData)) {
    const match = events.find(event => event.abilityName === abilityName)
    if (match?.abilityId) return match.abilityId
  }
  return ''
}

export function useAbilityIconCache(resolveInfo: AbilityInfoResolver = resolveAbilityInfo) {
  const abilityIconSrcs = ref<Record<string, string>>({})
  const abilityCooldownMs = ref<Record<string, number>>({})
  const abilityIconRequested = new Set<string>()

  function abilityIconSrc(abilityId: string, abilityName: string): string {
    return abilityIconSrcs.value[abilityIconKey(abilityId, abilityName)] ?? ''
  }

  function abilityRecastMs(abilityId: string, abilityName: string): number {
    return abilityCooldownMs.value[abilityIconKey(abilityId, abilityName)] ?? 0
  }

  function queueAbilityIcon(abilityId: string, abilityName: string): void {
    const key = abilityIconKey(abilityId, abilityName)
    if (abilityIconRequested.has(key)) return
    abilityIconRequested.add(key)
    resolveInfo(abilityId).then(info => {
      const iconSrc = safeAbilityIconSrc(info.iconSrc)
      if (iconSrc) abilityIconSrcs.value = { ...abilityIconSrcs.value, [key]: iconSrc }
      if (info.recastMs) abilityCooldownMs.value = { ...abilityCooldownMs.value, [key]: info.recastMs }
    })
  }

  function clearAbilityIcon(abilityId: string, abilityName: string): void {
    const key = abilityIconKey(abilityId, abilityName)
    if (!abilityIconSrcs.value[key]) return
    const next = { ...abilityIconSrcs.value }
    delete next[key]
    abilityIconSrcs.value = next
  }

  function queueCastTimelineRowIcons(rows: CastTimelineRow[]): void {
    for (const row of rows) {
      const first = row.events[0]
      if (first?.abilityId) queueAbilityIcon(first.abilityId, row.name)
    }
  }

  function queueVisibleAbilityIcons(sources: VisibleAbilityIconSources): void {
    for (const row of [...sources.abilities, ...sources.takenAbilities, ...sources.healingAbilities]) {
      queueAbilityIcon(row.abilityId, row.abilityName)
    }
    for (const row of sources.eventRows.slice(0, 80)) {
      const id = abilityIdForName(row.ability, [sources.allData, sources.damageTakenData, sources.healingReceivedData], sources.castData)
      if (id) queueAbilityIcon(id, row.ability)
    }
    for (const hit of sources.deathHitLog) {
      const id = abilityIdForName(hit.abilityName, [sources.allData, sources.damageTakenData, sources.healingReceivedData], sources.castData)
      if (id) queueAbilityIcon(id, hit.abilityName)
    }
  }

  return {
    abilityIconSrc,
    abilityRecastMs,
    queueAbilityIcon,
    clearAbilityIcon,
    queueCastTimelineRowIcons,
    queueVisibleAbilityIcons,
  }
}
