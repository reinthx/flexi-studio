import type { DeathEvent, DeathRecord } from '@shared/configSchema'
import { buildDeathEvents } from '@shared/deathRecap'

export function sortPlayerDeaths(deaths: DeathRecord[]): DeathRecord[] {
  try {
    if (!Array.isArray(deaths)) return []
    return deaths
      .filter(death => death && death.targetId && death.targetId.startsWith('10'))
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  } catch {
    return []
  }
}

export function deathEventsFor(death: DeathRecord): DeathEvent[] {
  if (Array.isArray(death.events) && death.events.length > 0) return death.events
  return buildDeathEvents(death.hpSamples ?? [], death.lastHits ?? [], death.timestamp ?? 0)
}

export function formatHpValue(value: number, format: (value: number) => string): string {
  return format(Math.max(0, Math.round(value)))
}

export function formatHpBefore(event: DeathEvent, format: (value: number) => string): string {
  const pct = Math.round(event.hpBefore * 100)
  return `${formatHpValue(event.hpBeforeRaw, format)} / ${formatHpValue(event.maxHp, format)} (${pct}%)`
}

export function deathHpBars(death: DeathRecord): Array<{
  x: number
  width: number
  hpBefore: number
  hpAfter: number
  type: 'dmg' | 'heal' | 'death'
  isEstimated: boolean
}> {
  const events = deathEventsFor(death)
  if (events.length === 0) return []
  const barWidth = 120 / events.length
  return events.map((event, index) => ({
    x: index * barWidth,
    width: barWidth,
    hpBefore: event.hpBefore,
    hpAfter: event.hpAfter,
    type: event.type,
    isEstimated: event.isEstimated === true,
  }))
}
