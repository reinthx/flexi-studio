import type { CastEvent, CombatantAbilityData, HitRecord, ResourceSample } from '@shared/configSchema'
import type { CastFilter, ResourceTrackKey } from './types'

export type CastTargetRow = { name: string; id: string; label: string; casts: number; hits: number; damage: number; healing: number; overheal: number }
export type CastAbilityRow = { name: string; casts: number; avgInterval: string; topTargets: Array<[string, number]>; targets: CastTargetRow[]; events: CastEvent[] }
export type CastTimelineRow = CastAbilityRow & { category: CastFilter; events: CastEvent[] }
export type CastTimelineGroup = { category: CastFilter; label: string; collapsed: boolean; rows: CastTimelineRow[] }
export type CastResourceTrack = { key: ResourceTrackKey; label: string; value: string; color: string; fill: string }
export type CastPlayerData = NonNullable<ReturnType<typeof buildCastPlayerData>>
export type CastTimelineContext = {
  duration: number
  timeTicks: number[]
  rows: CastTimelineRow[]
  groups: CastTimelineGroup[]
  pixelWidth: number
  resourceTracks: CastResourceTrack[]
}
export type CastInspectorRow = [string, string]
export type CastMitigationStackRow = { key: string; name: string; source: string; target?: string; time: string; overlap: string; expected: string; overlapMs: number }
export type CastMitigationEffectiveness = {
  expected: string
  hits: string
  stackedHits: string
  soloHits: string
  mitigated: string
  withoutThisMit: string
  scope: 'Selected Cast' | 'All Casts'
  stackedWith: CastMitigationStackRow[]
}
export type CastMitigationEffectivenessInput = {
  selectedPlayer: string
  selectedAbility?: CastAbilityRow | null
  selectedEvents: CastEvent[]
  selectedEvent?: CastEvent | null
  allCastData: Record<string, CastEvent[]>
  hitData: Record<string, HitRecord[]>
  combatantJobs: Record<string, string>
  partyNames: string[]
  combatantIds: Record<string, string>
  formatNumber: (value: number) => string
  formatTime: (ms: number) => string
}

const terms = (value: string) => value.split('|')
const MITIGATION_TERMS = terms("reprisal|rampart|arms length|arm's length|feint|addle|bloodbath|second wind|sentinel|guardian|hallowed ground|bulwark|sheltron|holy sheltron|intervention|divine veil|passage of arms|cover|vengeance|damnation|bloodwhetting|raw intuition|nascent flash|shake it off|thrill of battle|holmgang|equilibrium|shadow wall|the blackest night|oblation|dark mind|dark missionary|living dead|living shadow|nebula|camouflage|heart of stone|heart of corundum|heart of light|superbolide|great nebula|aurora|temperance|aquaveil|liturgy of the bell|divine benison|divine caress|asylum|plenary indulgence|benediction|tetragrammaton|sacred soil|expedient|seraphism|seraph|protraction|recitation|deployment tactics|emergency tactics|dissipation|fey illumination|excogitation|collective unconscious|exaltation|celestial intersection|neutral sect|macrocosmos|horoscope|synastry|kerachole|taurochole|haima|panhaima|holos|krasis|zoe|soteria|physis|rhizomata|pepsis|philosophia|eukrasian diagnosis|eukrasian prognosis|mantra|riddle of earth|shade shift|arcane crest|crest of time borrowed|third eye|perfect defense|troubadour|tactician|dismantle|shield samba|improvisation|improvised finish|curing waltz|manaward|magick barrier|radiant aegis|everlasting flight|barrier|mitig")
const COOLDOWN_TERMS = terms("sprint|swiftcast|lucid dreaming|surecast|true north|leg sweep|interject|low blow|provoke|shirk|fight or flight|requiescat|imperator|expiacion|circle of scorn|intervene|atonement|confiteor|berserk|inner release|infuriate|primal rend|primal wrath|onslaught|upheaval|orogeny|delirium|blood weapon|salted earth|salt and darkness|carve and spit|abyssal drain|shadowbringer|edge of shadow|flood of shadow|no mercy|bloodfest|sonic break|double down|rough divide|danger zone|blasting zone|bow shock|continuation|reign of beasts|presence of mind|thin air|assize|afflatus misery|aetherflow|chain stratagem|energy drain|draw|divination|lightspeed|earthly star|minor arcana|rhizomata|phlegma|toxikon|psyche|pneuma|ley lines|triplecast|amplifier|manafont|transpose|sharpcast|enochian|paradox|xenoglossy|foul|acceleration|embolden|manafication|fleche|contre sixte|corps-a-corps|engagement|displacement|resolution|searing light|summon bahamut|summon phoenix|summon solar bahamut|energy siphon|enkindle|aethercharge|fester|painflare|battle litany|life surge|lance charge|dragon sight|geirskogul|nastrond|wyrmwind thrust|stardiver|dragonfire dive|mirage dive|brotherhood|riddle of fire|riddle of wind|perfect balance|form shift|thunderclap|enlightenment|six-sided star|mug|trick attack|dokumori|bunshin|kassatsu|ten chi jin|dream within a dream|assassinate|bhavacakra|hellfrog medium|meikyo shisui|ikishoten|hissatsu|tsubame-gaeshi|hagakure|meditate|senei|guren|shoha|kaeshi|arcane circle|gluttony|plentiful harvest|enshroud|soul sow|harvest moon|lemure|communio|serpent's ire|reawaken|vicewinder|slither|uncoiled fury|twinfang|twinblood|battle voice|raging strikes|barrage|radiant finale|wanderer's minuet|mage's ballad|army's paeon|sidewinder|apex arrow|blast arrow|pitch perfect|wildfire|reassemble|barrel stabilizer|hypercharge|chainsaw|air anchor|drill|bio blaster|automaton queen|rook autoturret|queen overdrive|technical step|technical finish|devilment|flourish|standard step|standard finish|fan dance|starfall dance|tillana|saber dance|starry muse|subtractive palette|creature motif|weapon motif|landscape motif|muse|hammer stamp|mog of the ages|retribution of the madeen")
const HEAL_TERMS = terms('cure|heal|medica|regen|benefic|succor|adlo|physick|lustrate|essential dignity|afflatus|tetra|excog|indom|aspected|pneuma')

export const CAST_FILTER_LABELS: Record<CastFilter, string> = { cooldowns: 'Cooldowns', mitigations: 'Mitigations', dps: 'Abilities', heals: 'Heals' }
export const CAST_FILTER_ORDER: CastFilter[] = ['cooldowns', 'mitigations', 'dps', 'heals']
const CAST_FILTER_SORT: Record<CastFilter, number> = { cooldowns: 0, mitigations: 1, dps: 2, heals: 3 }

export function abilityMatchesTerms(abilityName: string, terms: string[]): boolean {
  const name = abilityName.toLowerCase().replace(/[’']/g, "'")
  return terms.some(term => name.includes(term))
}

export function castCategory(event: Pick<CastEvent, 'abilityName'>): CastFilter {
  if (abilityMatchesTerms(event.abilityName, MITIGATION_TERMS)) return 'mitigations'
  if (abilityMatchesTerms(event.abilityName, COOLDOWN_TERMS)) return 'cooldowns'
  if (abilityMatchesTerms(event.abilityName, HEAL_TERMS)) return 'heals'
  return 'dps'
}

export const isMitigationAbility = (abilityName: string) => abilityMatchesTerms(abilityName, MITIGATION_TERMS)

export function castFilterLabel(filter: CastFilter): string {
  return CAST_FILTER_LABELS[filter]
}

export function castMitigationWindow(event: CastEvent): { start: number; end: number } {
  const durationMs = event.buffDurationMs ?? Math.max(event.durationMs ?? 0, 15_000)
  return { start: event.t, end: event.t + durationMs }
}

export function castEventKey(event: CastEvent): string {
  return `${event.source}|${event.abilityId}|${event.abilityName}|${event.target}|${event.targetId ?? ''}|${event.t}`
}

export function selectedCastEventsForAbility(ability: CastAbilityRow | null | undefined, selectedEventKey: string | null | undefined): CastEvent[] {
  if (!ability) return []
  const selectedEvent = selectedEventKey
    ? ability.events.find(event => castEventKey(event) === selectedEventKey)
    : null
  return selectedEvent ? [selectedEvent] : ability.events
}

export function singleSelectedCastEvent(events: CastEvent[]): CastEvent | null {
  return events.length === 1 ? events[0] : null
}

export function mitigationReductionPercent(abilityName: string): number {
  const name = abilityName.toLowerCase().replace(/[’']/g, "'")
  const reductions: Array<[RegExp, number]> = [
    [/reprisal/, 0.10],
    [/feint/, 0.10],
    [/addle/, 0.10],
    [/rampart/, 0.20],
    [/sentinel/, 0.30],
    [/guardian/, 0.40],
    [/vengeance/, 0.30],
    [/damnation/, 0.40],
    [/bloodwhetting/, 0.10],
    [/raw intuition/, 0.10],
    [/nascent flash/, 0.10],
    [/shadow wall/, 0.30],
    [/dark mind/, 0.20],
    [/dark missionary/, 0.10],
    [/oblation/, 0.10],
    [/nebula/, 0.30],
    [/great nebula/, 0.40],
    [/camouflage/, 0.10],
    [/heart of stone/, 0.15],
    [/heart of corundum/, 0.15],
    [/heart of light/, 0.10],
    [/aquaveil/, 0.15],
    [/temperance/, 0.10],
    [/sacred soil/, 0.10],
    [/expedient/, 0.10],
    [/exaltation/, 0.10],
    [/collective unconscious/, 0.10],
    [/troubadour/, 0.10],
    [/tactician/, 0.10],
    [/shield samba/, 0.10],
    [/dismantle/, 0.10],
    [/magick barrier/, 0.10],
  ]
  return reductions.find(([pattern]) => pattern.test(name))?.[1] ?? 0
}

export function buildCastMitigationEffectiveness({
  selectedPlayer,
  selectedAbility,
  selectedEvents,
  selectedEvent,
  allCastData,
  hitData,
  combatantJobs,
  partyNames,
  combatantIds,
  formatNumber,
  formatTime,
}: CastMitigationEffectivenessInput): CastMitigationEffectiveness | null {
  if (!selectedPlayer || !selectedAbility) return null
  const abilityName = selectedAbility.name
  if (!isMitigationAbility(abilityName)) return null

  const reductionPct = mitigationReductionPercent(abilityName)
  const canEstimate = reductionPct > 0 && reductionPct < 1
  const windows = selectedEvents
    .map(castMitigationWindow)
    .filter(window => window.end > window.start)
  const incomingHits = (hitData[selectedPlayer] ?? [])
    .filter(hit => hit.type === 'dmg' && hit.amount > 0)
  const activeHits = incomingHits.filter(hit =>
    windows.some(window => hit.t >= window.start && hit.t <= window.end),
  )
  const selectedEventKeys = new Set(selectedEvents.map(castEventKey))
  const otherMitigationWindows = Object.values(allCastData)
    .flatMap(events => events)
    .filter(event => {
      if (!isMitigationAbility(event.abilityName)) return false
      if (!mitigationCouldAffectPlayer(event, selectedPlayer, combatantJobs, partyNames, combatantIds)) return false
      return !selectedEventKeys.has(castEventKey(event))
    })
    .map(event => ({ event, window: castMitigationWindow(event) }))
    .filter(({ window }) => window.end > window.start)
  const stackedHits = activeHits.filter(hit =>
    otherMitigationWindows.some(({ window }) => hit.t >= window.start && hit.t <= window.end),
  )
  const soloHits = activeHits.filter(hit => !stackedHits.includes(hit))
  const stackedWith = otherMitigationWindows
    .map(({ event, window }) => {
      const overlaps = windows
        .map(selectedWindow => ({
          start: Math.max(selectedWindow.start, window.start),
          end: Math.min(selectedWindow.end, window.end),
        }))
        .filter(overlap => overlap.end > overlap.start)
      const overlapMs = overlaps.reduce((sum, overlap) => sum + overlap.end - overlap.start, 0)
      const expectedReduction = mitigationReductionPercent(event.abilityName)
      return {
        key: castEventKey(event),
        name: event.abilityName,
        source: event.source,
        target: event.target,
        time: formatTime(event.t),
        overlap: `${(overlapMs / 1000).toFixed(overlapMs >= 10_000 ? 0 : 1)}s`,
        expected: expectedReduction > 0 ? `${(expectedReduction * 100).toFixed(0)}%` : '—',
        overlapMs,
      }
    })
    .filter(row => row.overlapMs > 0)
    .sort((a, b) => b.overlapMs - a.overlapMs || a.name.localeCompare(b.name))
  const estimatedReduced = canEstimate
    ? activeHits.reduce((sum, hit) => sum + (hit.amount / (1 - reductionPct) - hit.amount), 0)
    : 0
  const estimatedWithoutThisMit = activeHits.reduce((sum, hit) =>
    sum + (canEstimate ? hit.amount / (1 - reductionPct) : hit.amount),
  0)

  return {
    expected: canEstimate ? `${(reductionPct * 100).toFixed(0)}%` : '—',
    hits: `${activeHits.length}`,
    stackedHits: `${stackedHits.length}`,
    soloHits: `${soloHits.length}`,
    mitigated: estimatedReduced > 0 ? formatNumber(Math.round(estimatedReduced)) : '—',
    withoutThisMit: estimatedWithoutThisMit > 0 ? formatNumber(Math.round(estimatedWithoutThisMit)) : '—',
    scope: selectedEvent ? 'Selected Cast' : 'All Casts',
    stackedWith,
  }
}

export function buildCastPlayerData(events: CastEvent[], rawData: CombatantAbilityData, healingReceivedData: Record<string, CombatantAbilityData>, selectedPlayer: string) {
  if (events.length === 0) return null
  const abilityMap = new Map<string, CastEvent[]>()
  for (const event of events) abilityMap.set(event.abilityName, [...(abilityMap.get(event.abilityName) ?? []), event])
  const abilities = Array.from(abilityMap.entries()).map(([name, evts]) => {
    const targetRows = new Map<string, CastTargetRow>()
    const ensureTarget = (target: string, targetId = '') => {
      const rowName = target || 'Unknown'
      const key = targetId ? `${rowName}|${targetId}` : rowName
      const row = targetRows.get(key) ?? { name: rowName, id: targetId, label: rowName, casts: 0, hits: 0, damage: 0, healing: 0, overheal: 0 }
      targetRows.set(key, row)
      return row
    }
    const idBackedTargetForName = (target: string) => Array.from(targetRows.values()).find(row => row.id && row.name === target)
    const ensureBestKnownTarget = (target: string) => idBackedTargetForName(target) ?? ensureTarget(target)
    for (const ability of Object.values(rawData).filter(ability => ability.abilityName === name)) {
      if (ability.targetInstances) {
        for (const instance of Object.values(ability.targetInstances)) {
          const row = ensureTarget(instance.name, instance.id)
          row.hits += instance.hits
          row.damage += instance.total
        }
      } else {
        for (const [target, stats] of Object.entries(ability.targets ?? {})) {
          const row = ensureBestKnownTarget(target)
          row.hits += stats.hits
          row.damage += stats.total
        }
      }
    }
    for (const [target, abilities] of Object.entries(healingReceivedData)) {
      for (const ability of Object.values(abilities).filter(ability => ability.abilityName === name)) {
        const sourceStats = ability.sources?.[selectedPlayer]
        if (!sourceStats) continue
        const row = ensureBestKnownTarget(target)
        row.hits += sourceStats.hits
        row.healing += sourceStats.total
        row.overheal += sourceStats.overheal ?? 0
      }
    }
    for (const event of evts) {
      if (!event.target) continue
      const row = targetRows.size > 0
        ? idBackedTargetForName(event.target) ?? (event.targetId ? targetRows.get(`${event.target}|${event.targetId}`) : undefined) ?? ensureTarget(event.target)
        : ensureTarget(event.target, event.targetId ?? '')
      row.casts += 1
    }
    const targets = Array.from(targetRows.values()).sort((a, b) => scoreTarget(b) - scoreTarget(a) || a.name.localeCompare(b.name))
    labelDuplicateTargets(targets)
    const sortedEvents = [...evts].sort((a, b) => a.t - b.t)
    const intervals = sortedEvents.slice(1).map((event, i) => event.t - sortedEvents[i].t)
    return { name, casts: evts.length, avgInterval: (intervals.reduce((a, b) => a + b, 0) / Math.max(intervals.length, 1) / 1000).toFixed(1), topTargets: targets.map(target => [target.label, target.casts || target.hits] as [string, number]).slice(0, 3), targets, events: evts }
  }).sort((a, b) => b.casts - a.casts)
  return { abilities, maxDuration: Math.max(...events.map(event => event.t)), events }
}

export function buildCastTimelineContext(
  playerData: CastPlayerData | null,
  filters: Set<CastFilter>,
  collapsedGroups: Set<CastFilter>,
  resourceSamples: ResourceSample[],
): CastTimelineContext {
  const duration = playerData ? Math.ceil((playerData.maxDuration / 1000) / 10) * 10 : 0
  const rows = playerData ? buildCastTimelineRows(playerData.abilities, filters) : []
  return {
    duration,
    timeTicks: buildCastTimeTicks(duration),
    rows,
    groups: buildCastTimelineGroups(rows, collapsedGroups),
    pixelWidth: Math.max(1100, Math.ceil(duration * 14)),
    resourceTracks: buildCastResourceTracks(resourceSamples, duration),
  }
}

export function buildCastTimeTicks(durationSec: number): number[] {
  if (durationSec <= 0) return []
  const ticks: number[] = []
  for (let t = 0; t <= durationSec; t += 30) ticks.push(t)
  return ticks
}

export function buildCastTimelineRows(abilities: CastAbilityRow[], filters: Set<CastFilter>): CastTimelineRow[] {
  return abilities
    .map(ability => ({ ...ability, category: castCategory(ability.events[0] ?? { abilityName: ability.name }), events: ability.events.slice().sort((a, b) => a.t - b.t) }))
    .filter(row => filters.has(row.category))
    .sort((a, b) => CAST_FILTER_SORT[a.category] - CAST_FILTER_SORT[b.category] || b.casts - a.casts || a.name.localeCompare(b.name))
}

export function buildCastTimelineGroups(rows: CastTimelineRow[], collapsedGroups: Set<CastFilter>): CastTimelineGroup[] {
  return CAST_FILTER_ORDER
    .map(category => ({ category, label: CAST_FILTER_LABELS[category], collapsed: collapsedGroups.has(category), rows: rows.filter(row => row.category === category) }))
    .filter(group => group.rows.length > 0)
}

export function buildCastResourceTracks(samples: ResourceSample[], durationSec: number): CastResourceTrack[] {
  if (samples.length === 0 || durationSec <= 0) return []
  const latest = samples[samples.length - 1]
  const rows: CastResourceTrack[] = [{ key: 'hp', label: 'HP', value: `${Math.round((latest.hp ?? 0) * 100)}%`, color: '#22c55e', fill: 'rgba(34,197,94,0.16)' }]
  if (samples.some(sample => sample.mp !== undefined && (sample.maxMp ?? 0) > 0)) {
    rows.push({ key: 'mp', label: 'MP', value: `${Math.round((latest.mp ?? 0) * 100)}%`, color: '#38bdf8', fill: 'rgba(56,189,248,0.14)' })
  }
  return rows
}

export function resourcePoint(sample: ResourceSample, key: ResourceTrackKey, durationSec: number): { x: number; y: number } {
  const value = key === 'hp' ? sample.hp : (sample.mp ?? 0)
  return { x: clampedPct(sample.t, Math.max(1, durationSec * 1000)), y: Math.max(0, Math.min(100, (1 - value) * 100)) }
}

export function resourcePolyline(samples: ResourceSample[], key: ResourceTrackKey, durationSec: number): string {
  return samples.filter(sample => key === 'hp' || sample.mp !== undefined).map(sample => {
    const point = resourcePoint(sample, key, durationSec)
    return `${point.x.toFixed(2)},${point.y.toFixed(2)}`
  }).join(' ')
}

export function resourceAreaPath(samples: ResourceSample[], key: ResourceTrackKey, durationSec: number): string {
  const points = samples.filter(sample => key === 'hp' || sample.mp !== undefined).map(sample => resourcePoint(sample, key, durationSec))
  if (points.length === 0) return ''
  const start = points[0]
  const end = points[points.length - 1]
  const line = points.map(point => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  return `M ${start.x.toFixed(2)} 100 L ${start.x.toFixed(2)} ${start.y.toFixed(2)} ${line} L ${end.x.toFixed(2)} 100 Z`
}

export function castTimelinePct(ms: number, durationSec: number): string {
  return durationSec > 0 ? `${clampedPct(ms / 1000, durationSec)}%` : '0%'
}

export function castEventLeft(event: CastEvent, durationSec: number): string {
  return castTimelinePct(event.type === 'cast' && !event.buffDurationMs && event.endT ? event.endT : event.t, durationSec)
}

export function castEventWidth(event: CastEvent, durationSec: number): string {
  return event.buffDurationMs && durationSec > 0 ? `max(22px, ${Math.max(0, (event.buffDurationMs / 1000) / durationSec * 100)}%)` : '22px'
}

export function castCastWindowWidth(event: CastEvent, durationSec: number): string {
  if (event.type !== 'cast' || !event.durationMs || durationSec <= 0) return '0%'
  return `${Math.max(4, (event.durationMs / 1000) / durationSec * 100)}%`
}

export function castCooldownWidth(event: CastEvent, durationSec: number, cooldownMs: number): string {
  if (!cooldownMs || durationSec <= 0) return '0%'
  const startPct = ((event.t / 1000) / durationSec) * 100
  return `${Math.max(0, Math.min((cooldownMs / 1000) / durationSec * 100, 100 - startPct))}%`
}

export function castCooldownLabel(cooldownMs: number): string {
  return cooldownMs ? `${Math.round(cooldownMs / 1000)}s cooldown` : ''
}

export function buildCastInspectorRows(ability: CastAbilityRow | null | undefined): CastInspectorRow[] {
  return ability ? [
    ['Ability', ability.name],
    ['Casts', String(ability.casts)],
    ['Avg Interval', `${ability.avgInterval}s`],
    ['Target(s)', String(ability.targets.length)],
  ] : []
}

export function buildCastEventInspectorRows(event: CastEvent | null | undefined, formatTime: (ms: number) => string): CastInspectorRow[] {
  return event ? [
    ['Time', formatTime(event.t)],
    ['Target', event.target || '—'],
    ['Duration', `${((event.buffDurationMs ?? event.durationMs ?? 0) / 1000).toFixed(1)}s`],
  ] : []
}

export function buildMitigationInspectorRows(mitigation: CastMitigationEffectiveness | null | undefined): CastInspectorRow[] {
  return mitigation ? [
    ['Scope', mitigation.scope],
    ['Expected Reduction', mitigation.expected],
    ['Hits in Duration', mitigation.hits],
    ['Solo / Stacked Hits', `${mitigation.soloHits} / ${mitigation.stackedHits}`],
    ['Reduced Damage Taken By', mitigation.mitigated],
    ['Damage Without This Mit', mitigation.withoutThisMit],
  ] : []
}

function scoreTarget({ damage, healing, overheal, hits, casts }: CastTargetRow) {
  return damage + healing + overheal + hits + casts
}

function clampedPct(value: number, total: number) {
  return Math.max(0, Math.min(100, (value / total) * 100))
}

function labelDuplicateTargets(targets: CastTargetRow[]) {
  const seen = new Map<string, number>()
  const duplicates = new Set(targets.map(target => target.name).filter((target, index, names) => names.indexOf(target) !== index))
  for (const target of targets) {
    if (!duplicates.has(target.name)) continue
    const nextIndex = (seen.get(target.name) ?? 0) + 1
    seen.set(target.name, nextIndex)
    target.label = `${target.name} #${nextIndex}`
  }
}

function mitigationCouldAffectPlayer(
  event: CastEvent,
  selectedPlayer: string,
  combatantJobs: Record<string, string>,
  partyNames: string[],
  combatantIds: Record<string, string>,
): boolean {
  if (event.source === selectedPlayer || event.target === selectedPlayer) return true
  if (!event.target) return true

  const targetHasJob = Boolean(combatantJobs[event.target])
  const targetIsParty = partyNames.includes(event.target) || targetHasJob
  if (targetIsParty) return false

  const targetId = event.targetId || combatantIds[event.target] || ''
  return targetId.startsWith('4') || !targetHasJob
}
