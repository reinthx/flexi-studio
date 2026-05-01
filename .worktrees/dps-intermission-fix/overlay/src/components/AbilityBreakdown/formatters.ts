import type { PullEntry } from './types'

export function formatPartyLabel(pt: string | undefined, isSelf: boolean, partyIdx?: number, totalPartySize?: number): string {
  if (totalPartySize !== undefined && totalPartySize > 8 && partyIdx !== undefined && (!pt || pt === 'Solo' || pt === 'Party')) {
    const allianceParty = Math.floor(partyIdx / 8)
    const label = ['Alliance A', 'Alliance B', 'Alliance C'][allianceParty] ?? 'Party'
    return isSelf ? `${label} (YOU)` : label
  }
  if (totalPartySize !== undefined && totalPartySize <= 8) {
    if (!pt || pt === 'Solo') return 'Party'
    return pt.replace(/^Alliance/, 'Alliance ')
  }
  if (!pt) return 'Party'
  return pt.replace(/^Alliance/, 'Alliance ')
}

export function pctOf(count: number | undefined, total: number | undefined): string {
  if (!count || !total) return '-'
  return `${((count / total) * 100).toFixed(1)}%`
}

export function hitRange(minHit: number | undefined, maxHit: number | undefined, formatter: (n: number) => string): string {
  if (!minHit || minHit === Infinity || !maxHit) return '-'
  return `${formatter(minHit)} - ${formatter(maxHit)}`
}

export function rawHealingAverage(row: { totalDamage: number; overheal?: number; hits: number }): number {
  return row.hits > 0 ? Math.round((row.totalDamage + (row.overheal ?? 0)) / row.hits) : 0
}

export function overhealPct(row: { totalDamage: number; overheal?: number }): string {
  const raw = row.totalDamage + (row.overheal ?? 0)
  return raw > 0 ? (((row.overheal ?? 0) / raw) * 100).toFixed(1) : '0.0'
}

export function fmtTime(ms: number): string {
  if (!ms || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function fmtSeconds(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function entryPullLabel(entry: PullEntry): string {
  if (entry.index === null) return 'Live'
  return `Pull ${entry.pullNumber ?? 1}`
}

export function parseEntryDuration(entry: PullEntry | null): number {
  if (!entry?.duration) return 0
  const parts = entry.duration.split(':').map(part => parseInt(part, 10))
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0)
  if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0)
  return parseInt(entry.duration, 10) || 0
}

export function formatEntryDelta(value: number, formatter: (n: number) => string): string {
  if (!value) return 'same'
  return `${value > 0 ? '+' : '-'}${formatter(Math.abs(value))}`
}

export function pullOutcomeClass(entry: PullEntry | null | undefined): string {
  if (entry?.pullOutcome === 'clear') return 'success'
  if (entry?.pullOutcome === 'wipe') return 'danger'
  return ''
}
