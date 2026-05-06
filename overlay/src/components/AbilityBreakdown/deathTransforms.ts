import type { CastEvent, DeathEvent, DeathRecord } from '@shared/configSchema'
import { buildDeathEvents } from '@shared/deathRecap'

export type DeathWindow = { start: number; end: number }
export type DeathRelatedDamageRow = { ability: string; amount: number }
export type DeathInspectorRow = [string, string]
export type OverviewDeathEvent = {
  key: string
  label: string
  detail: string
  type: 'death'
  death: DeathRecord
}

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

export function deathsForActor(deaths: DeathRecord[], actorName: string): DeathRecord[] {
  return deaths.filter(death => death.targetName === actorName)
}

export function deathTimeSecondsForActor(deaths: DeathRecord[], actorName: string): number | null {
  if (!actorName) return null
  const death = deaths.find(death => death.targetName === actorName)
  return death ? death.timestamp / 1000 : null
}

export function resTimeSecondsForActor(deaths: DeathRecord[], actorName: string): number | null {
  if (!actorName) return null
  const death = deaths.find(death => death.targetName === actorName)
  return death?.resurrectTime ? death.resurrectTime / 1000 : null
}

export function countDeathEventAbilities(
  deaths: DeathRecord[],
  include: (event: DeathEvent, events: DeathEvent[]) => boolean,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const death of deaths) {
    const events = deathEventsFor(death)
    for (const event of events) {
      if (event.abilityName && include(event, events)) counts.set(event.abilityName, (counts.get(event.abilityName) ?? 0) + 1)
    }
  }
  return counts
}

export function nearDeathAbilityCounts(deaths: DeathRecord[]): Map<string, number> {
  return countDeathEventAbilities(deaths, (event, events) => {
    if (event.type !== 'dmg' || event.hpAfter >= 0.1) return false
    const windowStart = Math.max(0, event.t - 15000)
    return !events.some(e => e.type === 'heal' && e.t >= windowStart && e.t <= event.t + 5000)
  })
}

export function deathHealingAbilityCounts(deaths: DeathRecord[]): Map<string, number> {
  return countDeathEventAbilities(deaths, event => event.type === 'heal')
}

export function deathRelatedDamage(events: DeathEvent[]): DeathRelatedDamageRow[] {
  const totals = new Map<string, number>()
  for (const event of events) {
    if (event.type !== 'dmg' || event.isDeathBlow) continue
    totals.set(event.abilityName, (totals.get(event.abilityName) ?? 0) + event.amount)
  }
  return Array.from(totals.entries())
    .map(([ability, amount]) => ({ ability, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export function deathWindow(death: DeathRecord | null | undefined, events: DeathEvent[]): DeathWindow | null {
  if (!death || events.length === 0) return null
  return {
    start: Math.min(...events.map(event => event.t)),
    end: Math.max(death.timestamp, ...events.map(event => event.t)),
  }
}

export function castsInDeathWindow(events: CastEvent[], window: DeathWindow | null | undefined): CastEvent[] {
  return window ? events.filter(event => event.t >= window.start && event.t <= window.end) : []
}

export function deathRecapRows(
  death: DeathRecord | null | undefined,
  window: DeathWindow | null | undefined,
  events: DeathEvent[],
  formatTime: (ms: number) => string,
): DeathInspectorRow[] {
  return death ? [
    ['Time', formatTime(death.timestamp)],
    ['Raised', death.resurrectTime ? formatTime(death.resurrectTime) : 'No'],
    ['Window Length', window ? formatTime(window.end - window.start) : '—'],
    ['Estimated', events.some(hit => hit.isEstimated) ? 'Yes' : 'No'],
  ] : []
}

export function overviewDeathEvents(
  deaths: DeathRecord[],
  formatTime: (ms: number) => string,
  limit = 6,
): OverviewDeathEvent[] {
  return deaths
    .slice()
    .reverse()
    .slice(0, limit)
    .map((death, index) => ({
      key: `death-${index}-${death.timestamp}`,
      label: `${death.targetName} died`,
      detail: `at ${formatTime(death.timestamp)}${death.resurrectTime ? ` · raised ${formatTime(death.resurrectTime)}` : ''}`,
      type: 'death' as const,
      death,
    }))
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
