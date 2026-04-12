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
import { formatValue } from '../lib/formatValue'
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
      .sort((a, b) => parseFloat(b[g.sortBy] ?? '0') - parseFloat(a[g.sortBy] ?? '0'))
      .slice(0, g.maxCombatants)

    const maxVal = parseFloat(filtered[0]?.[g.dpsType] ?? '1') || 1

    const bars: BarFrame[] = filtered.map((c, i) => {
      const rawVal = parseFloat(c[g.dpsType] ?? '0')
      return {
        name: c.name,
        job: normalizeJob(c['Job'] ?? ''),
        fillFraction: rawVal / maxVal,
        displayValue: formatValue(rawVal, g.valueFormat),
        displayPct: c['damage%'] ?? '0',
        deaths: c.deaths ?? '0',
        crithit: c['crithit%'] ?? '---',
        directhit: c['DirectHitPct'] ?? '---',
        tohit: c.tohit ?? '---',
        enchps: formatValue(parseFloat(c.enchps ?? '0'), g.valueFormat),
        maxHit: (c.maxhit ?? '---').replace('-', ' '),
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
