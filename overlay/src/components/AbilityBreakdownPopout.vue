<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { formatValue } from '@shared/formatValue'
import type { DpsTimeline, DeathRecord, DeathEvent, CastEvent } from '@shared/configSchema'
import { TIMELINE_BUCKET_SEC } from '@shared/configSchema'
import { getJobIconSrc, normalizeJob } from '@shared/jobMap'
import { abilityInitials } from '@shared/abilityIcons'
import ActorRail from './AbilityBreakdown/ActorRail.vue'
import AbilityCell from './AbilityBreakdown/AbilityCell.vue'
import AbilityRowsTable from './AbilityBreakdown/AbilityRowsTable.vue'
import DeathsView from './AbilityBreakdown/DeathsView.vue'
import InspectorList from './AbilityBreakdown/InspectorList.vue'
import InspectorRows from './AbilityBreakdown/InspectorRows.vue'
import PullsView from './AbilityBreakdown/PullsView.vue'
import type { BreakdownView, CastFilter, EventFilter, PullEntry, ResourceTrackKey, TimelineOverlay } from './AbilityBreakdown/types'
import { abilityIdForName as findAbilityIdForName, useAbilityIconCache } from './AbilityBreakdown/abilityIconCache'
import { buildDoneInspectorRows, buildDoneSourceRows, buildDoneTargetRows, buildHealingAbilityRows, buildSortedAbilityRows, buildTakenInspectorRows, highestHitAbility, partyHighestHit as pickPartyHighestHit, selectAbilityRow, totalAbilityDamage, totalAbilityOverheal, totalEncounterDamage } from './AbilityBreakdown/abilityRows'
import { useActorMetrics } from './AbilityBreakdown/actorMetrics'
import {
  buildCastMitigationEffectiveness,
  buildCastEventInspectorRows,
  buildCastInspectorRows,
  buildMitigationInspectorRows,
  buildCastPlayerData,
  buildCastTimelineContext,
  castCastWindowWidth as castWindowWidth,
  castCooldownLabel as formatCastCooldownLabel,
  castCooldownWidth as cooldownWindowWidth,
  castEventKey,
  castEventLeft as eventLeft,
  castEventWidth as eventWidth,
  castFilterLabel as formatCastFilterLabel,
  castTimelinePct,
  CAST_FILTER_ORDER,
  resourceAreaPath as areaPath,
  resourcePolyline as polyline,
  selectedCastEventsForAbility,
  singleSelectedCastEvent,
} from './AbilityBreakdown/castTimeline'
import { actorJobFor, groupCombatants, isEnemyId, isNpcId, nameStyleFor, resolveSelectedCombatant, visibleCombatantNames } from './AbilityBreakdown/combatants'
import { BREAKDOWN_REQUEST_INTERVAL_MS, BREAKDOWN_SNAPSHOT_KEY, evaluateEncounterPayload, parseValidBreakdownSnapshot, useBreakdownDataState } from './AbilityBreakdown/dataState'
import type { BreakdownPayload } from './AbilityBreakdown/dataState'
import {
  castsInDeathWindow,
  deathEventsFor,
  deathHealingAbilityCounts,
  deathHpBars as buildDeathHpBars,
  deathRecapRows as buildDeathRecapRows,
  deathRelatedDamage as buildDeathRelatedDamage,
  deathTimeSecondsForActor,
  deathWindow as buildDeathWindow,
  deathsForActor,
  formatHpBefore as formatDeathHpBefore,
  nearDeathAbilityCounts,
  overviewDeathEvents,
  resTimeSecondsForActor,
  sortPlayerDeaths,
} from './AbilityBreakdown/deathTransforms'
import { buildActiveFilterChips, buildEventInspectorRows, useEventRows } from './AbilityBreakdown/eventRows'
import { entryPullLabel, fmtSeconds, fmtTime, formatEntryDelta, parseEntryDuration, pullOutcomeClass } from './AbilityBreakdown/formatters'
import {
  buildPullDashboardContext,
  buildPullDamageRows,
  partyHasRaidBuffJobs as detectPartyRaidBuffJobs,
  pullBuffWarnings,
  pullHasRaidBuffCast as detectPullRaidBuffCast,
  pullHasRaidBuffCredit as detectPullRaidBuffCredit,
} from './AbilityBreakdown/pullInsights'
import {
  buildOverviewTimelineBars,
  buildPullGroupDpsBars,
  buildRdpsTimeline,
  buildTimelineChartModel,
  buildTimelineDeathMarkers,
  buildTimelineHoverTooltip,
  buildTimelineInspectorRows,
  buildTimelineRaidBuffWindows,
  buildTimelineRaiseMarkers,
  castsInTimelineWindow,
  deathClusters,
  deathsInTimelineWindow,
  GROUP_COLOR,
  METRIC_LABELS,
  timelineWindowForBucket,
  topTimelineSpikes,
} from './AbilityBreakdown/timelineSummary'
import { useBreakdownViewState } from './AbilityBreakdown/viewState'

const {
  allData,
  dpsTimeline,
  hpsTimeline,
  dtakenTimeline,
  dpsByCombatant,
  damageByCombatant,
  rdpsByCombatant,
  rdpsGiven,
  rdpsTaken,
  selfName,
  blurNames,
  partyNames,
  selected,
  pullList,
  activePull,
  encounterDurationSec,
  hiddenSeries,
  damageTakenData,
  healingReceivedData,
  hitData,
  deaths,
  combatantIds,
  combatantJobs,
  showEnemies,
  lastBroadcastTime,
  castData,
  resourceData,
  partyData,
  clearBreakdownData,
  assignBreakdownPayload,
} = useBreakdownDataState()

const f = (n: number) => formatValue(n, 'abbreviated')

const {
  activeView,
  chartMetric,
  selectedAbility,
  doneDimension,
  takenMode,
  deathInspectorTab,
  eventWindowOnly,
  eventActorScope,
  eventFilters,
  timelineOverlays,
  timelineFocusBucket,
  castFilters,
  viewTabs,
  toggleTimelineOverlay,
  toggleEventFilter,
  toggleCastFilter,
  openTimelineAtBucket,
  doneSortColumn,
  doneSortDesc,
  sortDoneBy,
  takenSortColumn,
  takenSortDesc,
  sortTakenBy,
} = useBreakdownViewState()

const initialView = localStorage.getItem('flexi-breakdown-view')
if (initialView === 'pulls') {
  activeView.value = 'pulls'
  localStorage.removeItem('flexi-breakdown-view')
}

const collapsedCastGroups = ref<Set<CastFilter>>(new Set())
const {
  abilityIconSrc,
  abilityRecastMs,
  clearAbilityIcon,
  queueCastTimelineRowIcons,
  queueVisibleAbilityIcons,
} = useAbilityIconCache()

const pullHasRaidBuffCredit = computed(() => detectPullRaidBuffCredit(rdpsGiven.value))
const pullHasRaidBuffCast = computed(() => detectPullRaidBuffCast(castData.value))
const partyHasRaidBuffJobs = computed(() => detectPartyRaidBuffJobs(partyData.value, visibleCombatants.value, actorJob))
const buffWarnings = computed(() => pullBuffWarnings({
  activeView: activeView.value,
  selectedName: resolvedSelected.value,
  castData: castData.value,
  jobFor: actorJob,
  hasRaidBuffJobs: partyHasRaidBuffJobs.value,
  hasRaidBuffCast: pullHasRaidBuffCast.value,
  hasRaidBuffCredit: pullHasRaidBuffCredit.value,
}))

const showFriendlyNPCs = ref(false)

let lastAutoHidePull: number | null | undefined = undefined

const initName = localStorage.getItem('flexi-breakdown-init') ?? ''
localStorage.removeItem('flexi-breakdown-init')

const combatants = computed(() => Object.keys(allData.value))

function isEnemy(name: string): boolean {
  return isEnemyId(combatantIds.value[name])
}

function isNPC(name: string): boolean {
  return isNpcId(combatantIds.value[name])
}

const visibleCombatants = computed(() =>
  visibleCombatantNames(combatants.value, showEnemies.value, showFriendlyNPCs.value, isEnemy, isNPC)
)

const combatantGroups = computed(() => groupCombatants(visibleCombatants.value, partyData.value, selfName.value))

const groupCollapsed = ref<Set<string>>(new Set())

function toggleGroup(label: string) {
  if (groupCollapsed.value.has(label)) {
    groupCollapsed.value.delete(label)
  } else {
    groupCollapsed.value.add(label)
  }
}

const resolvedSelected = computed(() => resolveSelectedCombatant({
  selected: selected.value,
  initName,
  selfName: selfName.value,
  allData: allData.value,
  visibleCombatants: visibleCombatants.value,
}))

function actorJob(name: string): string {
  return actorJobFor(name, combatantJobs.value, partyData.value, normalizeJob)
}

function actorJobIcon(name: string): string {
  const job = actorJob(name)
  return job ? getJobIconSrc(job) : ''
}

function nameStyle(name: string) {
  return nameStyleFor(name, blurNames.value, selfName.value)
}

const rawData = computed(() => allData.value[resolvedSelected.value] ?? {})

const playerTotal = computed(() => totalAbilityDamage(rawData.value))

const encounterTotal = computed(() => totalEncounterDamage(allData.value))

const abilities = computed(() =>
  buildSortedAbilityRows(rawData.value, playerTotal.value, encounterDurationSec.value, doneSortColumn.value, doneSortDesc.value)
)

const doneTargetRows = computed(() =>
  buildDoneTargetRows(selectedActorCastEvents.value, rawData.value, healingReceivedData.value, resolvedSelected.value)
)

const doneSourceRows = computed(() =>
  buildDoneSourceRows(visibleCombatants.value, allData.value, encounterDurationSec.value, isEnemy)
)

const takenRawData = computed(() => damageTakenData.value[resolvedSelected.value] ?? {})

const takenTotal = computed(() => totalAbilityDamage(takenRawData.value))

const takenAbilities = computed(() =>
  buildSortedAbilityRows(takenRawData.value, takenTotal.value, encounterDurationSec.value, takenSortColumn.value, takenSortDesc.value)
)

const healingRawData = computed(() => healingReceivedData.value[resolvedSelected.value] ?? {})

const healingTotal = computed(() => totalAbilityDamage(healingRawData.value))

const healingOverhealTotal = computed(() => totalAbilityOverheal(healingRawData.value))

const healingAbilities = computed(() =>
  buildHealingAbilityRows(healingRawData.value, healingTotal.value, encounterDurationSec.value)
)

const incomingAbilities = computed(() => takenMode.value === 'healing' ? healingAbilities.value : takenAbilities.value)

const currentPullEntry = computed(() =>
  pullList.value.find(entry => entry.index === activePull.value) ?? null
)

const currentEncounterName = computed(() =>
  currentPullEntry.value?.encounterName ?? ''
)

const currentEncounterDuration = computed(() =>
  currentPullEntry.value?.duration ?? ''
)

const pullStatusLabel = computed(() => activePull.value === null ? 'Live' : 'Historical')
const encounterDurationLabel = computed(() =>
  currentEncounterDuration.value || fmtTime(encounterDurationSec.value * 1000)
)

const selectedActorDeaths = computed(() =>
  deathsForActor(sortedDeaths.value, resolvedSelected.value)
)

const selectedActorNearDeathCounts = computed(() => nearDeathAbilityCounts(selectedActorDeaths.value))
const selectedActorDeathHealingAbilitySet = computed(() => deathHealingAbilityCounts(selectedActorDeaths.value))

const selectedActorCastEvents = computed(() =>
  castData.value[resolvedSelected.value] ?? []
)

const selectedActorOverviewCards = computed(() => ([
  { label: 'Done', value: f(playerTotal.value), detail: `${abilities.value.length} abilities`, tone: 'done', view: 'done' as BreakdownView },
  { label: 'Taken', value: f(takenTotal.value), detail: `${takenAbilities.value.length} sources`, tone: 'taken', view: 'taken' as BreakdownView },
  { label: 'Deaths', value: String(selectedActorDeaths.value.length), detail: selectedActorDeaths.value.length > 0 ? `Last @ ${fmtTime(selectedActorDeaths.value.at(-1)?.timestamp ?? 0)}` : 'No deaths', tone: 'deaths', view: 'deaths' as BreakdownView },
  { label: 'Casts', value: f(selectedActorCastEvents.value.length), detail: `${castPlayerData.value?.abilities.length ?? 0} tracked abilities`, tone: 'casts', view: 'casts' as BreakdownView },
]))
const doneDimensionOptions = [['ability', 'Ability'], ['targets', 'Targets'], ['sources', 'Sources']] as const, takenModeOptions = [['damage', 'Damage Taken'], ['healing', 'Healing Received']] as const, chartMetricOptions = [['dps', 'DPS'], ['rdps', 'rDPS'], ['hps', 'HPS'], ['dtps', 'DTPS']] as const, deathInspectorTabs = [['recap', 'Recap'], ['context', 'Context'], ['related', 'Related Damage']] as const
const eventActorScopes = [['selected', 'Selected Actor'], ['all', 'All Actors']] as const, eventFilterOptions: EventFilter[] = ['damage', 'healing', 'casts', 'deaths', 'raises']
function eventSelectorBadgeFor(name: string): string {
  return `${eventRowCountFor(name)} rows`
}

function selectActor(name: string): void {
  selected.value = name
  castSelectedPlayer.value = name
  const nextHidden = new Set(hiddenSeries.value)
  nextHidden.delete(name)
  hiddenSeries.value = nextHidden
}

function selectAbility(name: string): void {
  selectedAbility.value = name
}

const sortedDeaths = computed(() => sortPlayerDeaths(deaths.value))

const castSelectedPlayer = ref('')
const castSelectedAbility = ref<string | null>(null)
const castSelectedEventKey = ref<string | null>(null)

watch(activePull, () => {
  castSelectedPlayer.value = ''
  castSelectedAbility.value = null
  castSelectedEventKey.value = null
  selectedAbility.value = ''
  eventWindowOnly.value = false
  deathInspectorTab.value = 'recap'
  selectedDeathIndex.value = null
})
watch(resolvedSelected, (name) => {
  selectedAbility.value = ''
  if (!name) return
  castSelectedPlayer.value = name
})

const castGroups = computed(() => {
  const allCastNames = Object.keys(castData.value)
  if (allCastNames.length === 0) return []
  const visibleCastNames = allCastNames.filter(name =>
    (showEnemies.value || !isEnemy(name)) && (showFriendlyNPCs.value || !isNPC(name))
  )
  return groupCombatants(visibleCastNames, partyData.value, selfName.value)
})

const castPlayerDeathTime = computed(() => deathTimeSecondsForActor(deaths.value, castSelectedPlayer.value))
const castPlayerResTime = computed(() => resTimeSecondsForActor(deaths.value, castSelectedPlayer.value))

const castPlayerData = computed(() => {
  if (!castSelectedPlayer.value) return null
  return buildCastPlayerData(castData.value[castSelectedPlayer.value] ?? [], rawData.value, healingReceivedData.value, castSelectedPlayer.value)
})

function selectCastAbilityRow(name: string): void {
  castSelectedAbility.value = name
  castSelectedEventKey.value = null
  selectAbility(name)
}

function selectCastEvent(name: string, event: CastEvent): void {
  castSelectedAbility.value = name
  castSelectedEventKey.value = castEventKey(event)
  selectAbility(name)
}

const selectedCastEvents = computed(() => selectedCastEventsForAbility(selectedCastAbility.value, castSelectedEventKey.value))
const selectedCastEvent = computed(() => singleSelectedCastEvent(selectedCastEvents.value))

const castMitigationEffectiveness = computed(() => buildCastMitigationEffectiveness({
  selectedPlayer: castSelectedPlayer.value,
  selectedAbility: selectedCastAbility.value,
  selectedEvents: selectedCastEvents.value,
  selectedEvent: selectedCastEvent.value,
  allCastData: castData.value,
  hitData: hitData.value,
  combatantJobs: combatantJobs.value,
  partyNames: partyNames.value,
  combatantIds: combatantIds.value,
  formatNumber: f,
  formatTime: fmtTime,
}))

const castFilterOrder = CAST_FILTER_ORDER

function castFilterLabel(filter: CastFilter): string {
  return formatCastFilterLabel(filter)
}

function toggleCastGroupCollapsed(category: CastFilter): void {
  const next = new Set(collapsedCastGroups.value)
  if (next.has(category)) next.delete(category)
  else next.add(category)
  collapsedCastGroups.value = next
}

const selectedResourceSamples = computed(() => {
  if (!castSelectedPlayer.value) return []
  return resourceData.value[castSelectedPlayer.value] ?? []
})

const castTimelineContext = computed(() =>
  buildCastTimelineContext(castPlayerData.value, castFilters.value, collapsedCastGroups.value, selectedResourceSamples.value)
)
const castTimelineDuration = computed(() => castTimelineContext.value.duration)
const castTimeTicks = computed(() => castTimelineContext.value.timeTicks)
const castTimelineRows = computed(() => castTimelineContext.value.rows)
const castTimelineGroups = computed(() => castTimelineContext.value.groups)
const castTimelinePixelWidth = computed(() => castTimelineContext.value.pixelWidth)
const castResourceTracks = computed(() => castTimelineContext.value.resourceTracks)

function resourcePolyline(key: ResourceTrackKey): string {
  return polyline(selectedResourceSamples.value, key, castTimelineDuration.value)
}

function resourceAreaPath(key: ResourceTrackKey): string {
  return areaPath(selectedResourceSamples.value, key, castTimelineDuration.value)
}

function castEventLeft(event: CastEvent): string {
  return eventLeft(event, castTimelineDuration.value)
}

function castEventWidth(event: CastEvent): string {
  return eventWidth(event, castTimelineDuration.value)
}

function castCastWindowLeft(event: CastEvent): string {
  return castTimelinePct(event.t, castTimelineDuration.value)
}

function timelinePct(sec: number): string {
  return castTimelinePct(sec * 1000, castTimelineDuration.value)
}

function castCastWindowWidth(event: CastEvent): string {
  return castWindowWidth(event, castTimelineDuration.value)
}

function castCooldownWidth(event: CastEvent): string {
  return cooldownWindowWidth(event, castTimelineDuration.value, event.cooldownMs ?? abilityRecastMs(event.abilityId, event.abilityName))
}

function castCooldownLabel(event: CastEvent): string {
  const cooldownMs = event.cooldownMs ?? abilityRecastMs(event.abilityId, event.abilityName)
  return formatCastCooldownLabel(cooldownMs)
}

function scrollElementHorizontallyByWheel(el: HTMLElement, e: WheelEvent): boolean {
  const maxScroll = el.scrollWidth - el.clientWidth
  if (maxScroll <= 0) return false
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!delta) return false
  el.scrollLeft += delta
  return true
}

function onCastTimelineWheel(e: WheelEvent): void {
  const target = e.target as HTMLElement | null
  const inLabelColumn = !!target?.closest('.cast-analysis-label, .cast-analysis-label-head, .cast-analysis-section:not(.cast-analysis-section--timeline)')
  if (inLabelColumn && !e.shiftKey) return
  if (scrollElementHorizontallyByWheel(e.currentTarget as HTMLElement, e)) {
    e.preventDefault()
  }
}

watch(castTimelineRows, queueCastTimelineRowIcons, { immediate: true })

function abilityIdForName(abilityName: string): string {
  return findAbilityIdForName(abilityName, [allData.value, damageTakenData.value, healingReceivedData.value], castData.value)
}

const selectedDeathIndex = ref<number | null>(null)

function openDeath(death: DeathRecord): void { selectActor(death.targetName); selectedDeathIndex.value = sortedDeaths.value.findIndex(d => d === death); activeView.value = 'deaths' }

function toggleDeathSelection(index: number, death: DeathRecord): void { selectedDeathIndex.value = selectedDeathIndex.value === index ? null : index; selectActor(death.targetName) }

function openActorDone(name: string): void { selectActor(name); activeView.value = 'done' }

function deathSelectionKey(death: DeathRecord | null | undefined): string {
  return death ? `${death.targetId}|${death.targetName}|${death.timestamp}` : ''
}

watch(deaths, () => {
  if (selectedDeathIndex.value === null) return
  const current = sortedDeaths.value[selectedDeathIndex.value]
  const key = deathSelectionKey(current)
  if (!key) {
    selectedDeathIndex.value = null
    return
  }
  const nextIndex = sortedDeaths.value.findIndex(death => deathSelectionKey(death) === key)
  selectedDeathIndex.value = nextIndex >= 0 ? nextIndex : null
})

const selectedDeath = computed<DeathRecord | null>(() =>
  selectedDeathIndex.value !== null ? (sortedDeaths.value[selectedDeathIndex.value] ?? null) : null
)

const deathHitLog = computed(() => selectedDeath.value ? deathEventsFor(selectedDeath.value) : [])

const selectedDoneAbility = computed(() =>
  selectAbilityRow(abilities.value, selectedAbility.value)
)

const selectedDoneHighestHitAbility = computed(() =>
  highestHitAbility(abilities.value)
)

const partyHighestHit = computed(() => pickPartyHighestHit(visibleCombatants.value, allData.value, isEnemy))

const selectedTakenAbility = computed(() =>
  selectAbilityRow(incomingAbilities.value, selectedAbility.value)
)

const selectedCastAbility = computed(() =>
  castPlayerData.value?.abilities.find(ability => ability.name === castSelectedAbility.value)
    ?? castPlayerData.value?.abilities.find(ability => ability.name === selectedAbility.value)
    ?? castPlayerData.value?.abilities[0]
    ?? null
)
const selectedDoneInspectorRows = computed(() =>
  buildDoneInspectorRows(selectedDoneAbility.value, encounterDurationSec.value, f)
)

const selectedTakenInspectorRows = computed(() =>
  buildTakenInspectorRows(selectedTakenAbility.value, takenMode.value, selectedActorNearDeathCounts.value, selectedActorDeathHealingAbilitySet.value, f)
)

const selectedCastInspectorRows = computed(() => buildCastInspectorRows(selectedCastAbility.value))
const selectedCastEventRows = computed(() => buildCastEventInspectorRows(selectedCastEvent.value, fmtTime))
const mitigationInspectorRows = computed(() => buildMitigationInspectorRows(castMitigationEffectiveness.value))
const overviewInspectorRows = computed(() => [['rDPS', f(rdpsFor(resolvedSelected.value))], ['DPS Given', f(rdpsGivenFor(resolvedSelected.value))], ['DPS Taken', f(rdpsTakenFor(resolvedSelected.value))], ['Biggest Hit', selectedDoneHighestHitAbility.value ? `${selectedDoneHighestHitAbility.value.abilityName} · ${f(selectedDoneHighestHitAbility.value.maxHit)}` : '—'], ['Biggest Taken', selectedTakenAbility.value?.abilityName ?? '—'], ['Deaths', String(selectedActorDeaths.value.length)], ['Casts', String(selectedActorCastEvents.value.length)]])

const selectedDeathRelatedDamage = computed(() => buildDeathRelatedDamage(deathHitLog.value))
const selectedDeathWindow = computed(() => buildDeathWindow(selectedDeath.value, deathHitLog.value))
const selectedDeathWindowCasts = computed(() => castsInDeathWindow(selectedActorCastEvents.value, selectedDeathWindow.value))
const selectedDeathRecapRows = computed(() => buildDeathRecapRows(selectedDeath.value, selectedDeathWindow.value, deathHitLog.value, fmtTime))
const overviewNotableEvents = computed(() => overviewDeathEvents(sortedDeaths.value, fmtTime))

const formatHpBefore = (event: DeathEvent) => formatDeathHpBefore(event, f)
const deathHpBars = (death: DeathRecord) => buildDeathHpBars(death)

function onPullSelect(e: Event): void {
  const val = (e.target as HTMLSelectElement).value
  const idx = val === 'null' ? null : parseInt(val, 10)
  activePull.value = idx
  channel?.postMessage({ type: 'loadPull', index: idx })
  if (idx !== null) {
    scheduleBroadcast()
  }
}

let broadcastTimer: ReturnType<typeof setTimeout> | null = null
function scheduleBroadcast() {
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    channel?.postMessage({ type: 'loadPull', index: activePull.value })
  }, 250)
}

function applyAutoHide(pullIdx: number | null | undefined, timeline: DpsTimeline): void {
  if (pullIdx === lastAutoHidePull) return
  lastAutoHidePull = pullIdx
  if (partyNames.value.length === 0) return
  const party = new Set([...partyNames.value, selfName.value, 'YOU'])
  const toHide = new Set<string>()
  for (const name of Object.keys(timeline)) {
    if (!party.has(name) && !isEnemy(name)) toHide.add(name)
  }
  hiddenSeries.value = toHide
}

function toggleSeries(name: string): void {
  const next = new Set(hiddenSeries.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  hiddenSeries.value = next
}

const PL = 52, PR = 16, PT = 12, PB = 28
const SVG_W = 500, SVG_H = 240
const CW = SVG_W - PL - PR
const CH = SVG_H - PT - PB

const activeTimeline = computed<DpsTimeline>(() => chartMetric.value === 'hps' ? hpsTimeline.value : chartMetric.value === 'dtps' ? dtakenTimeline.value : chartMetric.value === 'rdps' ? rdpsTimeline.value : dpsTimeline.value)
const metricLabel = computed(() => METRIC_LABELS[chartMetric.value])

const {
  rowActorNames,
  attributionDamageFor,
  dpsFor,
  rdpsFor,
  rdpsGivenFor,
  rdpsTakenFor,
  rdpsDeltaLabel,
  deathCountFor,
  selectorBadgeFor,
  takenSelectorBadgeFor,
  castSelectorBadgeFor,
  selectorFillWidth,
} = useActorMetrics({
  allData,
  selfName,
  visibleCombatants,
  damageByCombatant,
  dpsByCombatant,
  rdpsByCombatant,
  rdpsGiven,
  rdpsTaken,
  encounterDurationSec,
  damageTakenData,
  healingReceivedData,
  takenMode,
  sortedDeaths,
  castData,
  activeView,
  chartMetric,
  activeTimeline,
  metricLabel,
  format: f,
  isEnemy,
})

const actorRailCommon = computed(() => ({
  collapsedGroups: groupCollapsed.value,
  fillWidthFor: selectorFillWidth,
  actorJob,
  actorJobIcon,
  nameStyle,
  onToggleGroup: toggleGroup,
  onSelectActor: selectActor,
}))

const rdpsTimeline = computed<DpsTimeline>(() =>
  buildRdpsTimeline(dpsTimeline.value, rdpsByCombatant.value, encounterDurationSec.value)
)

const chartLines = computed(() => buildTimelineChartModel(activeTimeline.value, {
  showEnemies: showEnemies.value,
  isEnemy,
  selected: resolvedSelected.value,
  hiddenSeries: hiddenSeries.value,
  formatValue,
  geometry: { pl: PL, pt: PT, cw: CW, ch: CH },
}))

const svgRef      = ref<SVGSVGElement | null>(null)
const chartAreaRef = ref<HTMLDivElement | null>(null)
const hoverVisible = ref(false)
const hoverSvgX   = ref(0)
const hoverClientX = ref(0)
const hoverClientY = ref(0)

function onSvgMouseMove(e: MouseEvent): void {
  const svg  = svgRef.value
  const area = chartAreaRef.value
  if (!svg || !area) return
  const sr = svg.getBoundingClientRect()
  const ar = area.getBoundingClientRect()
  hoverSvgX.value   = ((e.clientX - sr.left) / sr.width) * SVG_W
  hoverClientX.value = e.clientX - ar.left
  hoverClientY.value = e.clientY - ar.top
  hoverVisible.value = hoverSvgX.value >= PL && hoverSvgX.value <= PL + CW
}

const hoverBucket = computed(() => {
  if (!hoverVisible.value && timelineFocusBucket.value !== null && chartLines.value) {
    return Math.max(0, Math.min(chartLines.value.maxBuckets - 1, timelineFocusBucket.value))
  }
  if (!hoverVisible.value || !chartLines.value) return -1
  const { maxBuckets } = chartLines.value
  if (maxBuckets < 2) return -1
  return Math.round(Math.max(0, Math.min(1, (hoverSvgX.value - PL) / CW)) * (maxBuckets - 1))
})

const hoverLineX = computed(() => {
  if (!chartLines.value || hoverBucket.value < 0) return 0
  return PL + (hoverBucket.value / (chartLines.value.maxBuckets - 1)) * CW
})

const hoverTooltip = computed(() => buildTimelineHoverTooltip(chartLines.value, hoverBucket.value, hiddenSeries.value, timelineRaidBuffWindows.value, timelineDeathMarkers.value, timelineRaiseMarkers.value, rdpsGivenFor, rdpsTakenFor))

const timelineInspectorRows = computed(() => buildTimelineInspectorRows({
  metricLabel: metricLabel.value,
  hoverTimeLabel: hoverTooltip.value?.timeLabel,
  deathCount: timelineInspectorDeaths.value.length,
  castCount: timelineInspectorCasts.value.length,
  chartMetric: chartMetric.value,
  selectedName: resolvedSelected.value,
  rdpsGivenFor,
  rdpsTakenFor,
  formatValue: f,
}))

const timelineRaidBuffWindows = computed(() => buildTimelineRaidBuffWindows(castData.value))
const timelineDeathMarkers = computed(() => buildTimelineDeathMarkers(sortedDeaths.value, fmtTime))
const timelineRaiseMarkers = computed(() => buildTimelineRaiseMarkers(sortedDeaths.value, fmtTime))

const timelineCastMarkers = computed(() =>
  selectedActorCastEvents.value
    .map(event => event.t / 1000)
    .filter(time => time >= 0)
)

const timelineSpikeMarkers = computed(() => {
  return topTimelineSpikes(activeTimeline.value[resolvedSelected.value] ?? [])
})

const overviewTimelineBars = computed(() => {
  return buildOverviewTimelineBars(activeTimeline.value[resolvedSelected.value] ?? [], fmtTime, f)
})

const pullGroupDpsBars = computed(() => {
  const names = Object.keys(dpsTimeline.value).filter(name => showEnemies.value || !isEnemy(name))
  return buildPullGroupDpsBars(dpsTimeline.value, names, sortedDeaths.value, fmtTime)
})

const pullDamageRows = computed(() => {
  return buildPullDamageRows(rowActorNames(), { attributionDamageFor, dpsFor, rdpsFor, rdpsGivenFor, rdpsTakenFor, deathCountFor })
})

function openOverviewCard(view: BreakdownView): void {
  activeView.value = view
}

function openSelectedTimeline(): void {
  const firstSpike = timelineSpikeMarkers.value[0]
  if (firstSpike) timelineFocusBucket.value = firstSpike.index
  activeView.value = 'timeline'
}

function openLatestDeath(): void {
  if (selectedActorDeaths.value.length > 0) {
    const latest = selectedActorDeaths.value[selectedActorDeaths.value.length - 1]
    selectedDeathIndex.value = sortedDeaths.value.findIndex(death => death === latest)
  }
  activeView.value = 'deaths'
}

function markerXForTime(timeSec: number, maxBuckets: number): number {
  const bucket = Math.max(0, Math.min(maxBuckets - 1, timeSec / TIMELINE_BUCKET_SEC))
  return PL + (bucket / Math.max(maxBuckets - 1, 1)) * CW
}

const hoverWindow = computed(() => timelineWindowForBucket(hoverBucket.value))
const timelineInspectorCasts = computed(() => castsInTimelineWindow(selectedActorCastEvents.value, hoverWindow.value, 6))
const timelineInspectorDeaths = computed(() => deathsInTimelineWindow(sortedDeaths.value, hoverWindow.value))

const tooltipStyle = computed(() => {
  if (!hoverVisible.value || !hoverTooltip.value || !chartAreaRef.value) return { display: 'none' }
  const areaW = chartAreaRef.value.clientWidth
  const W = 160
  const left = hoverClientX.value + 14 + W > areaW
    ? hoverClientX.value - W - 6
    : hoverClientX.value + 14
  const top = Math.max(4, Math.min(hoverClientY.value - 20, 60))
  return { display: 'block', left: `${left}px`, top: `${top}px` }
})

const deathClustersForCurrent = computed(() => {
  return deathClusters(sortedDeaths.value)
})
const pullDashboard = computed(() => buildPullDashboardContext(pullList.value, activePull.value, deathClustersForCurrent.value, f, fmtSeconds, fmtTime))
const selectedPullEntry = computed(() => pullDashboard.value.selectedPullEntry)
const enemyProgressHeadline = computed(() => pullDashboard.value.enemyProgressHeadline)
const enemyProgressMeta = computed(() => pullDashboard.value.enemyProgressMeta)
const enemyProgressDetail = computed(() => pullDashboard.value.enemyProgressDetail)
const previousPullEntry = computed(() => pullDashboard.value.previousPullEntry)
const pullDashboardNotes = computed(() => pullDashboard.value.pullDashboardNotes)

function selectPullEntry(entry: PullEntry): void {
  activePull.value = entry.index
  channel?.postMessage({ type: 'loadPull', index: entry.index })
}

const { eventRowCountFor, eventRows } = useEventRows({
  eventActorScope,
  visibleCombatants,
  resolvedSelected,
  castData,
  sortedDeaths,
  eventFilters,
  eventWindowOnly,
  selectedDeathWindow,
  format: f,
})

watch([abilities, takenAbilities, eventRows, deathHitLog], () => queueVisibleAbilityIcons({
  abilities: abilities.value,
  takenAbilities: takenAbilities.value,
  healingAbilities: healingAbilities.value,
  eventRows: eventRows.value,
  deathHitLog: deathHitLog.value,
  allData: allData.value,
  damageTakenData: damageTakenData.value,
  healingReceivedData: healingReceivedData.value,
  castData: castData.value,
}), { immediate: true })

const activeFilterChips = computed(() => buildActiveFilterChips({
  pullStatusLabel: pullStatusLabel.value,
  selectedPlayer: resolvedSelected.value,
  metricLabel: metricLabel.value,
  showEnemies: showEnemies.value,
  showFriendlyNPCs: showFriendlyNPCs.value,
  selectedAbility: selectedAbility.value,
  eventWindowOnly: eventWindowOnly.value,
  selectedDeathIndex: selectedDeathIndex.value,
  hasSelectedDeathWindow: Boolean(selectedDeathWindow.value),
}))
const eventInspectorRows = computed(() => buildEventInspectorRows({
  rowCount: eventRows.value.length,
  actorScope: eventActorScope.value,
  selectedAbility: selectedAbility.value,
  eventWindowOnly: eventWindowOnly.value,
  hasSelectedDeathWindow: Boolean(selectedDeathWindow.value),
}))

let channel: BroadcastChannel | null = null
let requestRetryTimers: Array<ReturnType<typeof setTimeout>> = []
let requestInterval: ReturnType<typeof setInterval> | null = null

function applyEncounterPayload(data: BreakdownPayload): boolean {
  const decision = evaluateEncounterPayload(data, {
    activePull: activePull.value,
    lastBroadcastTime: lastBroadcastTime.value,
    currentPullList: pullList.value,
    selectedPullEntry: selectedPullEntry.value,
  })
  if (!decision.accept) return false
  if (decision.liveHistoryChanged) {
    if (decision.nextPullList) pullList.value = decision.nextPullList
    if (decision.nextActivePull !== undefined) activePull.value = decision.nextActivePull
    return true
  }

  if (decision.incomingPullIndex !== activePull.value) clearBreakdownData()

  lastBroadcastTime.value = data.timestamp ?? 0
  assignBreakdownPayload(data)
  if ('pullIndex' in data) {
    activePull.value = data.pullIndex ?? null
    applyAutoHide(data.pullIndex ?? null, data.dpsTimeline ?? {})
  }
  if (data.selectedCombatant) {
    selected.value = data.selectedCombatant
  } else if (!selected.value && initName && allData.value[initName]) {
    selected.value = initName
  }
  return true
}

function tryApplySnapshot(): boolean {
  if (typeof localStorage === 'undefined') return false

  try {
    const raw = localStorage.getItem(BREAKDOWN_SNAPSHOT_KEY)
    const data = parseValidBreakdownSnapshot(raw, Date.now())
    if (!data) {
      localStorage.removeItem(BREAKDOWN_SNAPSHOT_KEY)
      return false
    }
    return applyEncounterPayload(data)
  } catch {
    localStorage.removeItem(BREAKDOWN_SNAPSHOT_KEY)
    return false
  }
}

function requestEncounterData() {
  channel?.postMessage({ type: 'request' })
}

onMounted(() => {
  document.title = 'Flexi Breakdown'
  tryApplySnapshot()
  if (typeof BroadcastChannel === 'undefined') return

  channel = new BroadcastChannel('flexi-breakdown')
  channel.onmessage = (e) => {
    if (e.data?.type === 'encounterData') {
      applyEncounterPayload(e.data)
    } else if (e.data?.type === 'selectCombatant') {
      selected.value = e.data.name ?? ''
    } else if (e.data?.type === 'setView' && (e.data.view === 'overview' || e.data.view === 'pulls')) {
      activeView.value = e.data.view
    }
  }
  requestEncounterData()
  requestRetryTimers = [150, 500, 1500].map(delay => setTimeout(requestEncounterData, delay))
  requestInterval = setInterval(requestEncounterData, BREAKDOWN_REQUEST_INTERVAL_MS)
})

onUnmounted(() => {
  for (const timer of requestRetryTimers) clearTimeout(timer)
  requestRetryTimers = []
  if (requestInterval) {
    clearInterval(requestInterval)
    requestInterval = null
  }
  channel?.close()
  channel = null
})
</script>

<template>
  <div class="bp-root">
    <div class="bp-topbar">
      <span class="bp-app-title">Flexi Breakdown</span>
      <span v-if="encounterTotal > 0" class="bp-total">{{ f(encounterTotal) }} tracked</span>
      <a class="bp-topbar-link" href="#/editor" target="_blank" rel="noreferrer">Editor</a>
    </div>

    <div class="bp-analysis-header">
      <div class="bp-analysis-main">
        <div class="bp-report-select-row">
          <div class="bp-analysis-kicker">Encounter</div>
          <select v-if="pullList.length > 0" class="bp-pull-select bp-pull-select--header"
            :value="String(activePull)" @change="onPullSelect">
            <option v-for="entry in pullList" :key="String(entry.index)" :value="String(entry.index)">
              {{ entry.index === null ? 'Live' : `${entry.encounterName}  ${entry.duration}` }}
            </option>
          </select>
        </div>
        <div class="bp-analysis-title">{{ currentEncounterName || 'Current Encounter' }}</div>
      </div>
      <div class="bp-analysis-stats">
        <div class="bp-analysis-stat">
          <span class="bp-analysis-label">Pull</span>
          <span class="bp-analysis-value">{{ currentPullEntry?.index === null || !currentPullEntry ? 'Live' : `#${currentPullEntry.index}` }}</span>
        </div>
        <div class="bp-analysis-stat">
          <span class="bp-analysis-label">Encounter</span>
          <span class="bp-analysis-value">{{ currentEncounterName || 'Unknown' }}</span>
        </div>
        <div class="bp-analysis-stat">
          <span class="bp-analysis-label">Duration</span>
          <span class="bp-analysis-value">{{ encounterDurationLabel }}</span>
        </div>
        <div class="bp-analysis-stat">
          <span class="bp-analysis-label">Status</span>
          <span class="bp-analysis-value">{{ pullStatusLabel }}</span>
        </div>
        <div class="bp-analysis-stat">
          <span class="bp-analysis-label">Selected Target</span>
          <span class="bp-analysis-value" :style="nameStyle(resolvedSelected)">{{ resolvedSelected || 'None' }}</span>
        </div>
      </div>
    </div>

    <div class="bp-filter-strip">
      <div class="bp-filter-groups">
        <button class="bp-filter-btn" :class="{ active: !showEnemies }" @click="showEnemies = false">Party</button>
        <button class="bp-filter-btn" :class="{ active: showEnemies }" @click="showEnemies = true">Show Enemies</button>
        <button class="bp-filter-btn" :class="{ active: showFriendlyNPCs }" @click="showFriendlyNPCs = !showFriendlyNPCs">NPCs</button>
        <button
          v-if="activeView === 'timeline'"
          v-for="overlay in ['buffs', 'deaths', 'raises', 'casts', 'spikes']"
          :key="overlay"
          class="bp-filter-btn"
          :class="{ active: timelineOverlays.has(overlay as TimelineOverlay) }"
          @click="toggleTimelineOverlay(overlay as TimelineOverlay)"
        >
          {{ overlay }}
        </button>
        <button
          v-if="activeView === 'events'"
          class="bp-filter-btn"
          :class="{ active: eventWindowOnly }"
          @click="eventWindowOnly = !eventWindowOnly"
        >
          Selected Window
        </button>
      </div>
      <div class="bp-chip-row">
        <span v-for="chip in activeFilterChips" :key="chip" class="bp-chip">{{ chip }}</span>
      </div>
    </div>

    <div class="bp-view-tabs">
      <button
        v-for="tab in viewTabs"
        :key="tab.id"
        class="bp-view-tab"
        :class="{ active: activeView === tab.id }"
        @click="activeView = tab.id"
      >
        {{ tab.label }}
        <span v-if="tab.id === 'deaths' && sortedDeaths.length > 0" class="bp-death-badge">{{ sortedDeaths.length }}</span>
      </button>
    </div>

    <div v-if="combatants.length === 0 && activeView !== 'pulls'" class="bp-waiting">Waiting for combat data…</div>
    <template v-else-if="activeView === 'overview'">
      <div class="bp-workspace">
        <ActorRail
          v-bind="actorRailCommon"
          :groups="combatantGroups"
          :selected-name="resolvedSelected"
          :value-for="selectorBadgeFor"
        />

        <main class="bp-main">
          <div class="bp-card-grid">
            <button
              v-for="card in selectedActorOverviewCards"
              :key="card.label"
              class="bp-card bp-card--button"
              :class="`bp-card--${card.tone}`"
              @click="openOverviewCard(card.view)"
            >
              <div class="bp-card-label">{{ card.label }}</div>
              <div class="bp-card-value">{{ card.value }}</div>
              <div class="bp-card-detail">{{ card.detail }}</div>
            </button>
          </div>

          <div class="bp-overview-grid">
            <AbilityRowsTable panel-title="Top Abilities Done" compact mode="done" :rows="abilities" :limit="6" :format="f" :icon-src="abilityIconSrc" :encounter-duration-sec="encounterDurationSec" @select="selectAbility" @icon-error="clearAbilityIcon" />

            <AbilityRowsTable panel-title="Top Abilities Taken" compact mode="taken" fill-class="enc-row-fill" :rows="takenAbilities" :limit="6" :format="f" :icon-src="abilityIconSrc" :near-death-counts="selectedActorNearDeathCounts" @select="selectAbility" @icon-error="clearAbilityIcon" />

            <section class="bp-panel">
              <div class="bp-panel-title">Timeline Snapshot</div>
              <div class="bp-mini-chart-shell">
                <div class="bp-mini-chart" :class="{ empty: overviewTimelineBars.length === 0 }">
                  <button
                    v-for="bar in overviewTimelineBars"
                    :key="bar.key"
                    class="bp-mini-chart-bar"
                    :style="{ height: bar.height }"
                    :title="`${bar.label} · ${bar.value}/s`"
                    @click="openTimelineAtBucket(bar.bucket)"
                  />
                  <span v-if="overviewTimelineBars.length === 0">No timeline samples yet.</span>
                </div>
                <div class="bp-mini-chart-values">
                  <span class="bp-mini-pill">{{ metricLabel }}</span>
                  <span class="bp-mini-pill">{{ f((activeTimeline[resolvedSelected] ?? []).reduce((sum, value) => sum + value, 0) / Math.max(encounterDurationSec, 1)) }}/s avg</span>
                  <button
                    v-for="spike in timelineSpikeMarkers"
                    :key="`overview-spike-${spike.index}`"
                    class="bp-mini-pill bp-mini-pill--button"
                    @click="openTimelineAtBucket(spike.index)"
                  >
                    Spike @ {{ fmtTime(spike.index * TIMELINE_BUCKET_SEC * 1000) }} · {{ f(spike.value) }}/s
                  </button>
                </div>
              </div>
            </section>

            <section class="bp-panel">
              <div class="bp-panel-title">Notable Events</div>
              <div v-if="overviewNotableEvents.length === 0" class="bp-empty-panel">No deaths or raise windows yet.</div>
              <button
                v-for="item in overviewNotableEvents"
                :key="item.key"
                class="bp-event-item"
                @click="openDeath(item.death)"
              >
                <span class="bp-event-name" :style="nameStyle(item.death.targetName)">{{ item.label }}</span>
                <span class="bp-event-detail">{{ item.detail }}</span>
              </button>
            </section>
          </div>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">Overview Inspector</div>
            <div class="bp-inspector-block">
              <div class="bp-kv"><span>Player</span><strong :style="nameStyle(resolvedSelected)">{{ resolvedSelected || 'None' }}</strong></div>
              <div v-for="[label, value] in overviewInspectorRows" :key="label" class="bp-kv"><span>{{ label }}</span><strong :title="label === 'rDPS' ? rdpsDeltaLabel(resolvedSelected) : undefined">{{ value }}</strong></div>
          </div>
          <div class="bp-inspector-block">
            <div class="bp-section-heading">Quick Actions</div>
            <button class="bp-action-btn" @click="activeView = 'pulls'">Open pull summary</button>
            <button class="bp-action-btn" @click="openOverviewCard('done')">Open outgoing breakdown</button>
            <button class="bp-action-btn" @click="openOverviewCard('taken')">Open incoming breakdown</button>
            <button class="bp-action-btn" @click="openSelectedTimeline">Open timeline at spike</button>
            <button class="bp-action-btn" :disabled="selectedActorDeaths.length === 0" @click="openLatestDeath">Open latest death</button>
            <div v-if="partyHighestHit" class="bp-party-highlight">
              <span class="bp-party-label">Party highest hit</span>
              <strong>{{ partyHighestHit.ability }} · {{ f(partyHighestHit.amount) }}</strong>
              <span :style="nameStyle(partyHighestHit.actor)">{{ partyHighestHit.actor }}</span>
            </div>
          </div>
        </aside>
      </div>
    </template>

    <template v-else-if="activeView === 'pulls'">
      <PullsView
        :pull-list="pullList"
        :active-pull="activePull"
        :selected-pull-entry="selectedPullEntry"
        :previous-pull-entry="previousPullEntry"
        :enemy-progress-headline="enemyProgressHeadline"
        :enemy-progress-meta="enemyProgressMeta"
        :enemy-progress-detail="enemyProgressDetail"
        :sorted-deaths="sortedDeaths"
        :death-clusters-for-current="deathClustersForCurrent"
        :pull-dashboard-notes="pullDashboardNotes"
        :buff-warnings="buffWarnings"
        :encounter-duration-label="encounterDurationLabel"
        :pull-group-dps-bars="pullGroupDpsBars"
        :pull-damage-rows="pullDamageRows"
        :resolved-selected="resolvedSelected"
        :f="f"
        :fmt-time="fmtTime"
        :fmt-seconds="fmtSeconds"
        :format-entry-delta="formatEntryDelta"
        :parse-entry-duration="parseEntryDuration"
        :entry-pull-label="entryPullLabel"
        :pull-outcome-class="pullOutcomeClass"
        :name-style="nameStyle"
        :actor-job-icon="actorJobIcon"
        @select-pull="selectPullEntry"
        @open-death="openDeath"
        @open-timeline-bucket="openTimelineAtBucket"
        @open-actor="openActorDone"
      />
    </template>

    <template v-else-if="activeView === 'done'">
      <div class="bp-workspace">
        <ActorRail
          v-bind="actorRailCommon"
          :groups="combatantGroups"
          :selected-name="resolvedSelected"
          :value-for="selectorBadgeFor"
        />

        <main class="bp-main">
          <div class="bp-panel-toolbar">
            <div class="bp-panel-title">Outgoing Breakdown</div>
            <div class="bp-toolbar-group">
              <button v-for="[value, label] in doneDimensionOptions" :key="value" class="bp-mode-btn" :class="{ active: doneDimension === value }" @click="doneDimension = value">{{ label }}</button>
            </div>
          </div>
          <div v-if="doneDimension === 'targets' && doneTargetRows.length === 0" class="bp-waiting">No target rows for this pull yet.</div>
          <div v-else-if="doneDimension === 'targets'" class="bp-scroll bp-scroll--targets">
            <table class="bp-table bp-table--targets">
              <thead><tr>
                <th class="col-name">Target</th>
                <th class="col-num">Uses</th>
                <th class="col-num">Damage</th>
                <th class="col-num">Effective Heal</th>
                <th class="col-num">Overheal</th>
                <th class="col-pct">%</th>
                <th class="col-name col-abilities">Abilities</th>
              </tr></thead>
              <tbody>
                <tr v-for="row in doneTargetRows" :key="`done-target-${row.target}`">
                  <td class="col-name"><div class="row-fill" :style="{ width: row.pct + '%' }" /><span class="aname" :style="nameStyle(row.target)">{{ row.target }}</span></td>
                  <td class="col-num">{{ row.casts }}</td>
                  <td class="col-num">{{ row.damage > 0 ? f(row.damage) : '—' }}</td>
                  <td class="col-num">{{ row.healing > 0 ? f(row.healing) : '—' }}</td>
                  <td class="col-num">{{ row.overheal > 0 ? f(row.overheal) : '—' }}</td>
                  <td class="col-pct">{{ row.pct }}%</td>
                  <td class="col-name col-abilities">
                    <div class="target-ability-stack">
                      <div
                        v-for="ability in row.abilities"
                        :key="`done-target-${row.target}-${ability.abilityId || ability.abilityName}`"
                        class="target-ability-row"
                      >
                        <AbilityCell
                          :ability-id="ability.abilityId"
                          :ability-name="ability.abilityName"
                          :icon-src="abilityIconSrc(ability.abilityId, ability.abilityName)"
                          small
                          @icon-error="clearAbilityIcon(ability.abilityId, ability.abilityName)"
                        />
                        <span class="target-ability-meta">
                          <span v-if="ability.casts > 0">{{ ability.casts }} use{{ ability.casts === 1 ? '' : 's' }}</span>
                          <span v-if="ability.damage > 0">{{ f(ability.damage) }} dmg</span>
                          <span v-if="ability.healing > 0">{{ f(ability.healing) }} heal</span>
                          <span v-if="ability.overheal > 0">{{ f(ability.overheal) }} over</span>
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else-if="doneDimension === 'sources' && doneSourceRows.length === 0" class="bp-waiting">No source rows for this pull yet.</div>
          <div v-else-if="doneDimension === 'sources'" class="bp-scroll">
            <table class="bp-table">
              <thead><tr>
                <th class="col-name">Source</th>
                <th class="col-num">Total</th>
                <th class="col-pct">%</th>
                <th class="col-num">DPS</th>
                <th class="col-num">Hits</th>
                <th class="col-num">Abilities</th>
              </tr></thead>
              <tbody>
                <tr v-for="row in doneSourceRows" :key="`done-source-${row.name}`" :class="{ 'bp-row-active': resolvedSelected === row.name }" @click="selectActor(row.name)">
                  <td class="col-name"><div class="row-fill" :style="{ width: row.pct + '%' }" /><span class="aname" :style="nameStyle(row.name)">{{ row.name }}</span></td>
                  <td class="col-num">{{ f(row.total) }}</td>
                  <td class="col-pct">{{ row.pct }}%</td>
                  <td class="col-num">{{ encounterDurationSec > 0 ? f(row.dps) : '—' }}</td>
                  <td class="col-num">{{ row.hits }}</td>
                  <td class="col-num">{{ row.abilityCount }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else-if="abilities.length === 0" class="bp-waiting">No outgoing ability data for this pull.</div>
          <div v-else class="bp-scroll">
            <AbilityRowsTable mode="done" :rows="abilities" :format="f" :icon-src="abilityIconSrc" :selected-ability-name="selectedDoneAbility?.abilityName" :sort-column="doneSortColumn" :sort-desc="doneSortDesc" :encounter-duration-sec="encounterDurationSec" @select="selectAbility" @sort="column => sortDoneBy(column as typeof doneSortColumn.value)" @icon-error="clearAbilityIcon" />
          </div>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">Ability Inspector</div>
          <div v-if="!selectedDoneAbility" class="bp-empty-panel">Select an ability to inspect it.</div>
          <InspectorRows v-else :rows="selectedDoneInspectorRows" />
        </aside>
      </div>
    </template>

    <template v-else-if="activeView === 'taken'">
      <div class="bp-workspace">
        <ActorRail
          v-bind="actorRailCommon"
          :groups="combatantGroups"
          :selected-name="resolvedSelected"
          fill-class="bp-rail-fill--taken"
          :value-for="takenSelectorBadgeFor"
        />

        <main class="bp-main">
          <div class="bp-panel-toolbar">
            <div class="bp-panel-title">Incoming Breakdown</div>
            <div class="bp-toolbar-group">
              <span v-if="takenMode === 'healing'" class="bp-mode-total">{{ f(healingTotal) }} effective · {{ f(healingOverhealTotal) }} overheal</span>
              <button v-for="[value, label] in takenModeOptions" :key="value" class="bp-mode-btn" :class="{ active: takenMode === value }" @click="takenMode = value">{{ label }}</button>
            </div>
          </div>
          <div v-if="incomingAbilities.length === 0" class="bp-waiting">No incoming {{ takenMode === 'healing' ? 'healing' : 'damage' }} data for this pull.</div>
          <div v-else class="bp-scroll">
            <AbilityRowsTable mode="taken" fill-class="enc-row-fill" :rows="incomingAbilities" :format="f" :icon-src="abilityIconSrc" :selected-ability-name="selectedTakenAbility?.abilityName" :sort-column="takenSortColumn" :sort-desc="takenSortDesc" :taken-mode="takenMode" :near-death-counts="takenMode === 'healing' ? selectedActorDeathHealingAbilitySet : selectedActorNearDeathCounts" @select="selectAbility" @sort="column => sortTakenBy(column as typeof takenSortColumn.value)" @icon-error="clearAbilityIcon" />
          </div>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">{{ takenMode === 'healing' ? 'Healing Inspector' : 'Taken Inspector' }}</div>
          <div v-if="!selectedTakenAbility" class="bp-empty-panel">Select an incoming ability to inspect it.</div>
          <InspectorRows v-else :rows="selectedTakenInspectorRows" />
        </aside>
      </div>
    </template>

    <template v-else-if="activeView === 'timeline'">
      <div class="bp-workspace">
        <ActorRail
          v-bind="actorRailCommon"
          :groups="combatantGroups"
          :selected-name="resolvedSelected"
          fill-class="bp-rail-fill--timeline"
          :value-for="selectorBadgeFor"
        >
          <template #before-groups>
            <div class="bp-metric-tabs">
              <button v-for="[value, label] in chartMetricOptions" :key="value" class="bp-metric-tab" :class="{ active: chartMetric === value }" @click="chartMetric = value">{{ label }}</button>
            </div>
          </template>
        </ActorRail>

        <main class="bp-main">
          <div v-if="!chartLines" class="bp-waiting">No {{ metricLabel }} data for this encounter.</div>
          <div v-else ref="chartAreaRef" class="bp-chart-area">
            <svg ref="svgRef" class="bp-chart-svg"
              :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
              preserveAspectRatio="xMidYMid meet"
              @mousemove="onSvgMouseMove"
              @mouseleave="hoverVisible = false">
              <g v-for="tick in chartLines.yTicks" :key="tick.y">
                <line :x1="PL" :y1="tick.y" :x2="PL + CW" :y2="tick.y" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
                <text :x="PL - 5" :y="tick.y + 4" text-anchor="end" class="axis-label">{{ tick.label }}</text>
              </g>
              <g v-for="tick in chartLines.xTicks" :key="tick.x">
                <line :x1="tick.x" :y1="PT" :x2="tick.x" :y2="PT + CH" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
                <text :x="tick.x" :y="PT + CH + 14" text-anchor="middle" class="axis-label">{{ tick.label }}</text>
              </g>
              <rect :x="PL" :y="PT" :width="CW" :height="CH" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />

              <rect
                v-if="timelineOverlays.has('buffs')"
                v-for="buff in timelineRaidBuffWindows"
                :key="`raidbuff-${buff.key}`"
                :x="markerXForTime(buff.start, chartLines.maxBuckets)"
                :y="PT"
                :width="Math.max(2, markerXForTime(buff.end, chartLines.maxBuckets) - markerXForTime(buff.start, chartLines.maxBuckets))"
                :height="CH"
                fill="rgba(116,185,255,0.12)"
                stroke="rgba(116,185,255,0.18)"
                stroke-width="0.5"
              >
                <title>{{ `${buff.name} active (${fmtSeconds(buff.start)}-${fmtSeconds(buff.end)})${buff.source ? ` from ${buff.source}` : ''}${buff.target ? ` on ${buff.target}` : ''}` }}</title>
              </rect>

              <polyline
                v-for="s in chartLines.series"
                v-show="!hiddenSeries.has(s.name)"
                :key="s.name"
                :points="chartLines.points(s.values)"
                fill="none"
                :stroke="s.color"
                :stroke-width="1.5"
                :stroke-dasharray="s.isGroup ? '5,3' : undefined"
                stroke-linejoin="round"
                stroke-linecap="round"
                :opacity="s.isGroup ? 0.45 : (s.isFocused ? 1 : 0.28)"
              />

              <line v-show="hoverVisible && hoverBucket >= 0"
                :x1="hoverLineX" :y1="PT" :x2="hoverLineX" :y2="PT + CH"
                stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-dasharray="3,3" />

              <circle
                v-for="s in chartLines.series.filter(s => !s.isGroup && !hiddenSeries.has(s.name))"
                v-show="hoverVisible && hoverBucket >= 0"
                :key="`dot-${s.name}`"
                :cx="hoverLineX"
                :cy="PT + CH - Math.min((s.values[hoverBucket] ?? 0) / chartLines.maxDps, 1) * CH"
                r="3" :fill="s.color" stroke="#0d0d10" stroke-width="1.5"
              />

              <line
                v-if="timelineOverlays.has('deaths')"
                v-for="marker in timelineDeathMarkers"
                :key="marker.key"
                :x1="markerXForTime(marker.time, chartLines.maxBuckets)"
                :y1="PT"
                :x2="markerXForTime(marker.time, chartLines.maxBuckets)"
                :y2="PT + CH"
                stroke="rgba(255,70,70,0.55)"
                stroke-width="1.5"
              >
                <title>{{ marker.label }}</title>
              </line>

              <line
                v-if="timelineOverlays.has('raises')"
                v-for="marker in timelineRaiseMarkers"
                :key="marker.key"
                :x1="markerXForTime(marker.time, chartLines.maxBuckets)"
                :y1="PT"
                :x2="markerXForTime(marker.time, chartLines.maxBuckets)"
                :y2="PT + CH"
                stroke="rgba(255,255,255,0.72)"
                stroke-width="1.5"
              >
                <title>{{ marker.label }}</title>
              </line>

              <circle
                v-if="timelineOverlays.has('casts')"
                v-for="time in timelineCastMarkers"
                :key="`cast-marker-${time}`"
                :cx="markerXForTime(time, chartLines.maxBuckets)"
                :cy="PT + CH + 6"
                r="2"
                fill="#74b9ff"
              />

              <rect
                v-if="timelineOverlays.has('spikes')"
                v-for="spike in timelineSpikeMarkers"
                :key="`spike-${spike.index}`"
                :x="markerXForTime(spike.index * TIMELINE_BUCKET_SEC, chartLines.maxBuckets) - 4"
                :y="PT"
                width="8"
                :height="CH"
                fill="rgba(255,210,80,0.08)"
              />
            </svg>

            <div class="bp-tooltip" :style="tooltipStyle" v-if="hoverTooltip">
              <div class="bp-tooltip-time">{{ hoverTooltip.timeLabel }}</div>
              <div v-for="entry in hoverTooltip.entries" :key="entry.name" class="bp-tooltip-row">
                <span class="bp-tooltip-dot" :style="{ background: entry.color }" />
                <span class="bp-tooltip-name" :style="nameStyle(entry.name)">{{ entry.label }}</span>
                <span class="bp-tooltip-val">{{ f(entry.value) }}</span>
                <span v-if="chartMetric === 'rdps'" class="bp-tooltip-adj">+{{ f(entry.rdpsGiven) }} / -{{ f(entry.rdpsTaken) }}</span>
              </div>
              <div v-if="hoverTooltip.entries.length > 1" class="bp-tooltip-group">
                <span class="bp-tooltip-name">Group</span>
                <span class="bp-tooltip-val">{{ f(hoverTooltip.groupVal) }}</span>
              </div>
              <div v-if="hoverTooltip.activeBuffs.length > 0" class="bp-tooltip-section">
                <div class="bp-tooltip-section-title">Raid Buffs</div>
                <div v-for="buff in hoverTooltip.activeBuffs" :key="`tip-${buff.key}`" class="bp-tooltip-row">
                  <span class="bp-tooltip-name">{{ buff.name }}</span>
                  <span class="bp-tooltip-val">{{ buff.source }}</span>
                </div>
              </div>
              <div v-if="hoverTooltip.deaths.length > 0 || hoverTooltip.raises.length > 0" class="bp-tooltip-section">
                <div class="bp-tooltip-section-title">Events</div>
                <div v-for="marker in hoverTooltip.deaths" :key="`tip-${marker.key}`" class="bp-tooltip-row">
                  <span class="bp-tooltip-name" :style="nameStyle(marker.death.targetName)">{{ marker.death.targetName }}</span>
                  <span class="bp-tooltip-val">Died</span>
                </div>
                <div v-for="marker in hoverTooltip.raises" :key="`tip-${marker.key}`" class="bp-tooltip-row">
                  <span class="bp-tooltip-name" :style="nameStyle(marker.death.targetName)">{{ marker.death.targetName }}</span>
                  <span class="bp-tooltip-val">Raised by {{ marker.death.resurrectSourceName || 'Unknown' }}</span>
                </div>
              </div>
            </div>

            <div class="bp-chart-legend">
              <div v-for="s in chartLines.series" :key="s.name" class="bp-legend-item" :class="{ hidden: hiddenSeries.has(s.name) }" @click="toggleSeries(s.name)">
                <span class="bp-legend-dot"
                  :style="{ background: s.isGroup ? 'transparent' : s.color, border: s.isGroup ? `1px dashed ${GROUP_COLOR}` : 'none' }" />
                <span class="bp-legend-name" :class="{ 'bp-legend-name--focused': s.isFocused }" :style="s.isGroup ? undefined : nameStyle(s.name)">{{ s.isGroup ? 'Group' : s.name }}</span>
              </div>
            </div>
          </div>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">Timeline Inspector</div>
            <div class="bp-inspector-block">
              <div class="bp-kv"><span>Selected Actor</span><strong :style="nameStyle(resolvedSelected)">{{ resolvedSelected }}</strong></div>
            </div>
          <InspectorRows :rows="timelineInspectorRows" />
          <InspectorList
            heading="Window Events"
            empty-text="Hover the chart to correlate deaths, raises, and casts in the same time bucket."
            :rows="[
              ...timelineInspectorDeaths.map(death => ({ key: `ins-death-${death.timestamp}`, title: death.targetName, titleStyle: nameStyle(death.targetName), detail: `Death @ ${fmtTime(death.timestamp)}` })),
              ...timelineInspectorCasts.map(cast => ({ key: `ins-cast-${cast.t}-${cast.abilityName}`, title: cast.abilityName, detail: cast.target ? `→ ${cast.target}` : 'cast' })),
            ]"
          />
        </aside>
      </div>
    </template>

    <template v-else-if="activeView === 'deaths'">
      <DeathsView
        :sorted-deaths="sortedDeaths"
        :selected-death-index="selectedDeathIndex"
        :selected-death="selectedDeath"
        :selected-death-window="selectedDeathWindow"
        :death-hit-log="deathHitLog"
        :death-inspector-tab="deathInspectorTab"
        :death-inspector-tabs="deathInspectorTabs"
        :selected-death-recap-rows="selectedDeathRecapRows"
        :selected-death-window-casts="selectedDeathWindowCasts"
        :selected-death-related-damage="selectedDeathRelatedDamage"
        :selected-ability="selectedAbility"
        :f="f"
        :fmt-time="fmtTime"
        :name-style="nameStyle"
        :death-hp-bars="deathHpBars"
        :format-hp-before="formatHpBefore"
        :ability-id-for-name="abilityIdForName"
        :ability-icon-src="abilityIconSrc"
        @select-death="toggleDeathSelection"
        @select-ability="selectAbility"
        @clear-ability-icon="clearAbilityIcon"
        @update-death-inspector-tab="deathInspectorTab = $event"
      />
    </template>

    <template v-else-if="activeView === 'casts'">
      <div class="bp-workspace">
        <ActorRail
          v-bind="actorRailCommon"
          :groups="castGroups"
          :selected-name="castSelectedPlayer"
          fill-class="bp-rail-fill--casts"
          :value-for="castSelectorBadgeFor"
        />

        <main class="bp-main">
          <div v-if="!castPlayerData" class="bp-waiting">Select a party member to view casts.</div>
          <template v-else>
            <div class="cast-list-header">
              <span>{{ castPlayerData.abilities.length }} abilities · {{ castPlayerData.events.length }} total casts</span>
              <div class="bp-toolbar-group">
                <button
                  v-for="filter in castFilterOrder"
                  :key="filter"
                  class="bp-mode-btn"
                  :class="{ active: castFilters.has(filter as CastFilter) }"
                  @click="toggleCastFilter(filter as CastFilter)"
                >
                  {{ castFilterLabel(filter as CastFilter) }}
                </button>
              </div>
            </div>
            <div class="cast-analysis-shell">
              <div class="cast-analysis-scroll" @wheel="onCastTimelineWheel">
                <div class="cast-analysis-table" :style="{ width: (castTimelinePixelWidth + 170) + 'px' }">
                  <div class="cast-analysis-label-head">
                    <span>Timeline</span>
                    <small>Wheel or drag horizontally</small>
                  </div>
                  <div class="cast-analysis-grid cast-analysis-grid--head">
                    <div class="cast-analysis-axis">
                      <span v-for="tick in castTimeTicks" :key="`axis-${tick}`" class="cast-xiv-tick" :style="{ left: timelinePct(tick) }">{{ fmtSeconds(tick) }}</span>
                    </div>
                    <div
                      v-for="tick in castTimeTicks"
                      :key="`grid-${tick}`"
                      class="cast-analysis-gridline"
                      :style="{ left: timelinePct(tick) }"
                    />
                    <div v-if="castPlayerDeathTime !== null" class="cast-analysis-death-line" :style="{ left: timelinePct(castPlayerDeathTime) }" />
                    <div v-if="castPlayerResTime !== null" class="cast-analysis-raise-line" :style="{ left: timelinePct(castPlayerResTime) }" />
                  </div>

                  <template v-if="castResourceTracks.length > 0">
                    <div class="cast-analysis-section">Resources</div>
                    <div class="cast-analysis-section cast-analysis-section--timeline"></div>
                    <template v-for="track in castResourceTracks" :key="track.key">
                      <div class="cast-analysis-label cast-resource-label">
                        <span class="cast-analysis-name">{{ track.label }}</span>
                        <span class="cast-analysis-meta">{{ track.value }}</span>
                      </div>
                      <div class="cast-analysis-grid cast-analysis-grid--resource">
                        <div
                          v-for="tick in castTimeTicks"
                          :key="`resource-grid-${track.key}-${tick}`"
                          class="cast-analysis-gridline"
                          :style="{ left: timelinePct(tick) }"
                        />
                        <svg class="cast-resource-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                          <path :d="resourceAreaPath(track.key)" :fill="track.fill" />
                          <polyline :points="resourcePolyline(track.key)" fill="none" :stroke="track.color" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
                        </svg>
                        <div v-if="castPlayerDeathTime !== null" class="cast-analysis-death-line" :style="{ left: timelinePct(castPlayerDeathTime) }" />
                        <div v-if="castPlayerResTime !== null" class="cast-analysis-raise-line" :style="{ left: timelinePct(castPlayerResTime) }" />
                      </div>
                    </template>
                  </template>

                  <template v-for="group in castTimelineGroups" :key="group.category">
                    <button
                      class="cast-analysis-section cast-analysis-section-toggle"
                      :class="{ collapsed: group.collapsed }"
                      @click="toggleCastGroupCollapsed(group.category)"
                      :aria-expanded="!group.collapsed"
                    >
                      <span class="cast-section-caret">{{ group.collapsed ? '+' : '-' }}</span>
                      <span>{{ group.label }}</span>
                      <small>{{ group.rows.length }}</small>
                    </button>
                    <div class="cast-analysis-section cast-analysis-section--timeline"></div>
                    <template v-if="!group.collapsed">
                    <template v-for="row in group.rows" :key="row.name">
                      <div
                        class="cast-analysis-label"
                        :class="{ active: castSelectedAbility === row.name || selectedAbility === row.name }"
                        @click="selectCastAbilityRow(row.name)"
                      >
                        <span class="cast-ability-icon">
                          <img v-if="abilityIconSrc(row.events[0]?.abilityId ?? '', row.name)" :src="abilityIconSrc(row.events[0]?.abilityId ?? '', row.name)" :alt="row.name" @error="clearAbilityIcon(row.events[0]?.abilityId ?? '', row.name)" />
                          <span v-else>{{ abilityInitials(row.name) }}</span>
                        </span>
                        <span class="cast-analysis-name">{{ row.name }}</span>
                        <span class="cast-analysis-meta">{{ row.casts }} · avg {{ row.avgInterval }}s</span>
                      </div>
                      <div
                        class="cast-analysis-grid cast-analysis-grid--row"
                        :class="{ active: castSelectedAbility === row.name || selectedAbility === row.name }"
                        @click="selectCastAbilityRow(row.name)"
                      >
                      <div
                        v-for="tick in castTimeTicks"
                        :key="`row-grid-${row.name}-${tick}`"
                        class="cast-analysis-gridline"
                        :style="{ left: timelinePct(tick) }"
                      />
                      <template v-if="row.category === 'cooldowns' || row.category === 'mitigations'">
                        <div
                          v-for="event in row.events"
                          :key="`row-cooldown-${event.t}-${event.abilityName}-${event.target}`"
                          class="cast-cooldown-window"
                          :style="{ left: castEventLeft(event), width: castCooldownWidth(event) }"
                          :title="castCooldownLabel(event)"
                        />
                      </template>
                      <div
                        v-for="event in row.events.filter(e => e.type === 'cast' && e.durationMs && !e.buffDurationMs)"
                        :key="`row-cast-window-${event.t}-${event.abilityName}-${event.target}`"
                        class="cast-cast-window"
                        :style="{ left: castCastWindowLeft(event), width: castCastWindowWidth(event) }"
                        :title="`${event.abilityName} · ${(event.durationMs! / 1000).toFixed(1)}s cast`"
                      />
                      <button
                        v-for="event in row.events"
                        :key="`row-event-${event.t}-${event.abilityName}-${event.target}`"
                        class="cast-analysis-event"
                        :class="[`cast-analysis-event--${row.category}`, { active: castSelectedEventKey === castEventKey(event) }]"
                        :style="{ left: castEventLeft(event), width: (row.category === 'cooldowns' || row.category === 'mitigations') ? '22px' : castEventWidth(event) }"
                        :title="`${fmtTime(event.t)} · ${event.abilityName}${event.durationMs ? ` · ${(event.durationMs / 1000).toFixed(1)}s cast` : ''}${event.buffDurationMs ? ` · ${(event.buffDurationMs / 1000).toFixed(0)}s active` : ''}${castCooldownLabel(event) ? ` · ${castCooldownLabel(event)}` : ''}${event.target ? ` → ${event.target}` : ''}`"
                        @click.stop="selectCastEvent(row.name, event)"
                      >
                        <img v-if="abilityIconSrc(event.abilityId, event.abilityName)" class="cast-event-icon" :src="abilityIconSrc(event.abilityId, event.abilityName)" :alt="event.abilityName" @error="clearAbilityIcon(event.abilityId, event.abilityName)" />
                        <span v-else>{{ abilityInitials(row.name) }}</span>
                      </button>
                      <div v-if="castPlayerDeathTime !== null" class="cast-analysis-death-line" :style="{ left: timelinePct(castPlayerDeathTime) }" />
                      <div v-if="castPlayerResTime !== null" class="cast-analysis-raise-line" :style="{ left: timelinePct(castPlayerResTime) }" />
                    </div>
                    </template>
                    </template>
                  </template>
                  <div v-if="castTimelineGroups.length === 0" class="bp-empty-panel">
                    No casts match the active filters.
                  </div>
                </div>
              </div>
            </div>
          </template>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">Cast Inspector</div>
          <div v-if="!selectedCastAbility" class="bp-empty-panel">Select an ability to inspect its cadence and targets.</div>
          <template v-else>
            <InspectorRows :rows="selectedCastInspectorRows" />
            <InspectorRows v-if="selectedCastEvent" heading="Selected Cast" :rows="selectedCastEventRows" />
            <div class="bp-inspector-block">
              <div class="bp-section-heading">Target(s)</div>
              <div v-if="selectedCastAbility.targets.length === 0" class="bp-empty-panel">No target data captured for this ability.</div>
              <div v-else class="cast-target-list">
                <div v-for="target in selectedCastAbility.targets" :key="target.id ? `${target.name}-${target.id}` : target.name" class="cast-target-row">
                  <span class="cast-target-name" :style="nameStyle(target.name)" :title="target.id ? `${target.name} · ${target.id}` : target.name">{{ target.label }}</span>
                  <span class="cast-target-detail">
                    <span v-if="target.casts > 0">{{ target.casts }} cast{{ target.casts === 1 ? '' : 's' }}</span>
                    <span v-if="target.hits > 0">{{ target.hits }} hit{{ target.hits === 1 ? '' : 's' }}</span>
                    <span v-if="target.damage > 0">{{ f(target.damage) }} dmg</span>
                    <span v-if="target.healing > 0">{{ f(target.healing) }} heal</span>
                    <span v-if="target.overheal > 0">{{ f(target.overheal) }} over</span>
                  </span>
                </div>
              </div>
            </div>
            <InspectorRows v-if="castMitigationEffectiveness" heading="Mitigation Efficiency" :rows="mitigationInspectorRows" />
            <div v-if="castMitigationEffectiveness" class="bp-inspector-block">
              <div class="bp-section-heading">Stacked With</div>
              <div v-if="castMitigationEffectiveness.stackedWith.length === 0" class="bp-empty-panel">No overlapping mitigation captured.</div>
              <div v-else class="cast-target-list">
                <div v-for="mit in castMitigationEffectiveness.stackedWith" :key="mit.key" class="cast-target-row">
                  <span class="cast-target-name" :title="`${mit.time} · ${mit.source}${mit.target ? ` → ${mit.target}` : ''}`">{{ mit.name }}</span>
                  <span class="cast-target-detail">
                    <span>{{ mit.expected }}</span>
                    <span>{{ mit.overlap }}</span>
                    <span>{{ mit.source }}</span>
                  </span>
                </div>
              </div>
            </div>
          </template>
        </aside>
      </div>
    </template>

    <template v-else-if="activeView === 'events'">
      <div class="bp-workspace">
        <ActorRail
          v-bind="actorRailCommon"
          :groups="combatantGroups"
          :selected-name="resolvedSelected"
          fill-class="bp-rail-fill--events"
          :value-for="eventSelectorBadgeFor"
        />

        <main class="bp-main">
          <div class="bp-panel-toolbar">
            <div class="bp-panel-title">Unified Events</div>
            <div class="bp-toolbar-group">
              <button v-for="[value, label] in eventActorScopes" :key="value" class="bp-mode-btn" :class="{ active: eventActorScope === value }" @click="eventActorScope = value">{{ label }}</button>
              <button v-for="filter in eventFilterOptions" :key="filter" class="bp-mode-btn" :class="{ active: eventFilters.has(filter) }" @click="toggleEventFilter(filter)">{{ filter }}</button>
            </div>
          </div>
          <div v-if="eventRows.length === 0" class="bp-waiting">No event rows match the current filters. This v1 view combines casts and death-recap events until the full shared event stream lands.</div>
          <div v-else class="bp-scroll">
            <table class="bp-table">
              <thead><tr>
                <th class="col-num">Time</th>
                <th class="col-name">Actor</th>
                <th class="col-name">Event Type</th>
                <th class="col-name">Ability</th>
                <th class="col-name">Source</th>
                <th class="col-name">Target</th>
                <th class="col-num">Amount</th>
                <th class="col-name">HP Before</th>
                <th class="col-name">HP After</th>
                <th class="col-name">Notes</th>
              </tr></thead>
              <tbody>
                <tr v-for="row in eventRows" :key="row.key" :class="{ 'bp-row-active': selectedAbility === row.ability }" @click="selectAbility(row.ability)">
                  <td class="col-num">{{ fmtTime(row.t) }}</td>
                  <td class="col-name"><span class="aname" :style="nameStyle(row.actor)">{{ row.actor }}</span></td>
                  <td class="col-name">{{ row.eventType }}</td>
                  <td class="col-name"><AbilityCell :ability-id="abilityIdForName(row.ability)" :ability-name="row.ability" :icon-src="abilityIconSrc(abilityIdForName(row.ability), row.ability)" small @icon-error="clearAbilityIcon(abilityIdForName(row.ability), row.ability)" /></td>
                  <td class="col-name">{{ row.source || '—' }}</td>
                  <td class="col-name">{{ row.target || '—' }}</td>
                  <td class="col-num">{{ row.amount === null ? '—' : f(row.amount) }}</td>
                  <td class="col-name">{{ row.hpBefore }}</td>
                  <td class="col-name">{{ row.hpAfter }}</td>
                  <td class="col-name">{{ row.note }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">Event Inspector</div>
          <InspectorRows :rows="eventInspectorRows" />
          <div class="bp-inspector-block">
            <div class="bp-section-heading">Scope</div>
            <p class="bp-inspector-copy">This first pass merges cast rows, death recap rows, and raise detection into one table so we can keep cross-view continuity today while the shared event stream grows underneath it.</p>
          </div>
        </aside>
      </div>
    </template>

  </div>
</template>

<style src="./AbilityBreakdown/AbilityBreakdownPopout.css"></style>
