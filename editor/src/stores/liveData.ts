/**
 * Editor's live data store — mirrors the overlay's but feeds the preview area.
 * Always uses mock data since the editor runs without ACT.
 */
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  addListener,
  removeListener,
  startEvents,
  stopEvents,
  setMockStateGetter,
  resolvePets,
  TransitionEngine,
  DEFAULT_PROFILE,
  deepClone,
} from '@shared/index'
import type { CombatDataEvent, ChangePrimaryPlayerEvent, PartyChangedEvent, Frame, BarFrame, Profile } from '@shared/index'
import { formatValue } from '@shared/formatValue'
import { buildMetricFractions, createMetricFractionContext } from '@shared/metricFractions'
import { normalizeJob } from '@shared/jobMap'

export const useLiveDataStore = defineStore('editorLiveData', () => {
  const selfName = ref('')
  const partyNames = ref<Set<string>>(new Set())
  const frame = shallowRef<Frame | null>(null)
  const isActive = ref(false)

  // Throttle to ~30fps to avoid overwhelming Vue's reactivity
  let lastFrameTime = 0
  const THROTTLE_MS = 33

  const engine = new TransitionEngine((f) => {
    const now = performance.now()
    if (now - lastFrameTime >= THROTTLE_MS) {
      lastFrameTime = now
      frame.value = f
    }
  })

  function buildFrame(event: CombatDataEvent, profile: Profile): void {
    const g = profile.global
    const { combatants } = resolvePets(event.Combatant, g.pets)

    // Use combatantFilter if set, otherwise fall back to legacy partyOnly/selfOnly
    const filter = g.combatantFilter ?? (g.selfOnly ? 'self' : g.partyOnly ? 'party' : 'all')

    let filtered = combatants
    if (filter === 'self') {
      filtered = filtered.filter(c => c.name === selfName.value || c.name === 'YOU')
    } else if (filter === 'party' && partyNames.value.size > 0) {
      filtered = filtered.filter(c => partyNames.value.has(c.name) || c.name === 'YOU')
    }

    filtered = [...filtered]
      .sort((a, b) => {
        if (g.sortBy === 'role') {
          const roleOrder: Record<string, number> = { tank: 0, healer: 1, melee: 2, ranged: 3, caster: 4, unknown: 5 }
          const getJobRole = (job: string) => {
            const JOB_ROLES: Record<string, string> = { PLD: 'tank', WAR: 'tank', DRK: 'tank', GNB: 'tank', WHM: 'healer', SCH: 'healer', AST: 'healer', SGE: 'healer', MNK: 'melee', DRG: 'melee', NIN: 'melee', SAM: 'melee', RPR: 'melee', VPR: 'melee', BRD: 'ranged', MCH: 'ranged', DNC: 'ranged', BLM: 'caster', SMN: 'caster', RDM: 'caster', PCT: 'caster', BLU: 'caster' }
            return JOB_ROLES[normalizeJob(job)] ?? 'unknown'
          }
          return (roleOrder[getJobRole(b['Job'] ?? '')] ?? 5) - (roleOrder[getJobRole(a['Job'] ?? '')] ?? 5)
        }
        return parseFloat(b[g.sortBy] ?? '0') - parseFloat(a[g.sortBy] ?? '0')
      })
      .slice(0, g.maxCombatants)

    const effectiveDpsType = (g.dpsType as any) === 'role' ? 'encdps' : g.dpsType
    const maxVal = parseFloat(filtered[0]?.[effectiveDpsType] ?? '1') || 1
    const metricFractionContext = createMetricFractionContext(filtered)

    const bars: BarFrame[] = filtered.map((c) => {
      const rawVal = parseFloat(c[effectiveDpsType] ?? '0')
      return {
        name: c.name,
        job: normalizeJob(c['Job'] ?? ''),
        partyGroup: 'Party',
        fillFraction: rawVal / maxVal,
        displayValue: formatValue(rawVal, g.valueFormat),
        displayPct: c['damage%'] ?? '0',
        deaths: c.deaths ?? '0',
        crithit: c['crithit%'] ?? '---',
        directhit: c['DirectHitPct'] ?? '---',
        tohit: c.tohit ?? '---',
        enchps: formatValue(parseFloat(c.enchps ?? '0'), g.valueFormat),
        rdps: formatValue(parseFloat(c['rdps'] ?? '0'), g.valueFormat),
        rawValue: rawVal,
        rawEnchps: parseFloat(c.enchps ?? '0'),
        rawRdps: parseFloat(c['rdps'] ?? '0'),
        maxHit: (c.maxhit ?? '---').replace('-', ' '),
        metricFractions: buildMetricFractions(metricFractionContext, c),
        alpha: 1,
      }
    })

    engine.setDuration(g.transitionDuration)
    engine.push({
      bars,
      encounterTitle: event.Encounter['title'] ?? '',
      encounterDuration: event.Encounter['duration'] ?? '',
      totalDps: formatValue(parseFloat(event.Encounter['ENCDPS'] ?? '0'), g.valueFormat),
      totalHps: formatValue(parseFloat(event.Encounter['ENCHPS'] ?? '0'), g.valueFormat),
      totalDtps: formatValue(parseFloat(event.Encounter['DTRPS'] ?? '0'), g.valueFormat),
      totalRdps: formatValue(parseFloat(event.Encounter['RDPS'] ?? '0'), g.valueFormat),
      isActive: event.isActive === 'true',
    })
  }

  let getCurrentProfile: () => Profile = () => deepClone(DEFAULT_PROFILE)

  function setProfileGetter(fn: () => Profile): void {
    getCurrentProfile = fn
  }

  function onCombatData(event: CombatDataEvent): void {
    buildFrame(event, getCurrentProfile())
    isActive.value = event.isActive === 'true'
  }

  function onChangePrimaryPlayer(event: ChangePrimaryPlayerEvent): void {
    selfName.value = event.charName
  }

  function onPartyChanged(event: PartyChangedEvent): void {
    partyNames.value = new Set(event.party.map(p => p.name))
  }

  function start(): void {
    setMockStateGetter(() => true)
    addListener('CombatData', onCombatData)
    addListener('ChangePrimaryPlayer', onChangePrimaryPlayer)
    addListener('PartyChanged', onPartyChanged)
    startEvents()
  }

  function stop(): void {
    removeListener('CombatData', onCombatData)
    removeListener('ChangePrimaryPlayer', onChangePrimaryPlayer)
    removeListener('PartyChanged', onPartyChanged)
    stopEvents()
    engine.stop()
  }

  return { frame, selfName, isActive, start, stop, setProfileGetter, buildFrame }
})
