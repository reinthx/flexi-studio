/**
 * overlayBridge.ts
 *
 * Wraps the OverlayPlugin API with three connection modes:
 *  1. Modern API (common.min.js — addOverlayListener / startOverlayEvents)
 *  2. Legacy API (native CEF injection — onOverlayDataUpdate, etc.)
 *  3. Dev mock (no ACT connection)
 */

import type {
  CombatDataEvent,
  ChangePrimaryPlayerEvent,
  ChangeZoneEvent,
  PartyChangedEvent,
  BroadcastMessageEvent,
} from './configSchema'

export type OverlayEventMap = {
  CombatData: CombatDataEvent
  ChangePrimaryPlayer: ChangePrimaryPlayerEvent
  ChangeZone: ChangeZoneEvent
  PartyChanged: PartyChangedEvent
  BroadcastMessage: BroadcastMessageEvent
}

type EventName = keyof OverlayEventMap
type EventCallback<K extends EventName> = (data: OverlayEventMap[K]) => void

declare global {
  interface Window {
    OverlayPluginApi?: { ready: boolean; callHandler: (json: string, cb?: (r: string) => void) => void }
    addOverlayListener?: <K extends EventName>(event: K, cb: EventCallback<K>) => void
    removeOverlayListener?: <K extends EventName>(event: K, cb: EventCallback<K>) => void
    callOverlayHandler?: (params: Record<string, unknown>) => Promise<unknown>
    startOverlayEvents?: () => void
  }
}

const _wsParam = new URLSearchParams(window.location.search).get('OVERLAY_WS') ?? ''

let getMockState: (() => boolean) | null = null

export function setMockStateGetter(getter: () => boolean): void {
  getMockState = getter
}

type ConnectionMode = 'modern' | 'legacy' | 'mock'

// ─── Legacy event handling (always registered, fires regardless of mode) ──────

let legacyListenersRegistered = false
const legacyCallbacks = new Map<EventName, Set<EventCallback<EventName>>>()

function registerLegacyListeners(): void {
  if (legacyListenersRegistered) return
  legacyListenersRegistered = true

  const targets: EventTarget[] = [document, window]

  targets.forEach(target => {
    target.addEventListener('onOverlayDataUpdate', (e: Event) => {
      emitToCallbacks('CombatData', (e as CustomEvent).detail as CombatDataEvent)
    })
  })

  targets.forEach(target => {
    target.addEventListener('onBroadcastMessageReceive', (e: Event) => {
      const detail = (e as CustomEvent).detail
      emitToCallbacks('BroadcastMessage', {
        type: 'BroadcastMessage',
        source: detail?.source ?? '',
        msg: detail?.message ?? detail,
      } as BroadcastMessageEvent)
    })
  })

  targets.forEach(target => {
    target.addEventListener('onChangePrimaryPlayer', (e: Event) => {
      emitToCallbacks('ChangePrimaryPlayer', (e as CustomEvent).detail as ChangePrimaryPlayerEvent)
    })
  })

  targets.forEach(target => {
    target.addEventListener('onChangeZone', (e: Event) => {
      emitToCallbacks('ChangeZone', (e as CustomEvent).detail as ChangeZoneEvent)
    })
  })

  targets.forEach(target => {
    target.addEventListener('onPartyChanged', (e: Event) => {
      emitToCallbacks('PartyChanged', (e as CustomEvent).detail as PartyChangedEvent)
    })
  })
}

function emitToCallbacks<K extends EventName>(event: K, data: OverlayEventMap[K]): void {
  legacyCallbacks.get(event)?.forEach(cb => cb(data))
}

// ─── Mode detection ───────────────────────────────────────────────────────────

function detectMode(): ConnectionMode {
  if (getMockState?.()) return 'mock'

  if (_wsParam && !_wsParam.includes('/fake')) return 'modern'

  if (typeof window.addOverlayListener === 'function' && typeof window.startOverlayEvents === 'function') {
    return 'modern'
  }

  if (typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) return 'mock'

  return 'legacy'
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function addListener<K extends EventName>(
  event: K,
  callback: EventCallback<K>,
): void {
  const mode = detectMode()

  registerLegacyListeners()
  if (!legacyCallbacks.has(event)) legacyCallbacks.set(event, new Set())
  legacyCallbacks.get(event)!.add(callback as EventCallback<EventName>)

  if (mode === 'modern') {
    window.addOverlayListener!(event, callback)
    return
  }

  if (mode === 'mock') {
    devAddListener(event, callback as EventCallback<EventName>)
  }
}

export function removeListener<K extends EventName>(
  event: K,
  callback: EventCallback<K>,
): void {
  const mode = detectMode()

  if (mode === 'modern') {
    window.removeOverlayListener!(event, callback)
    return
  }

  if (mode === 'legacy') {
    legacyCallbacks.get(event)?.delete(callback as EventCallback<EventName>)
    return
  }

  devRemoveListener(event, callback as EventCallback<EventName>)
}

export async function callHandler(params: Record<string, unknown>): Promise<unknown> {
  const mode = detectMode()

  if (mode === 'modern' && window.callOverlayHandler) {
    return window.callOverlayHandler(params)
  }

  if (mode === 'legacy' && window.OverlayPluginApi?.callHandler) {
    return new Promise(resolve => {
      window.OverlayPluginApi!.callHandler(JSON.stringify(params), result => {
        resolve(result ? JSON.parse(result) : null)
      })
    })
  }

  return devCallHandler(params)
}

export function startEvents(): void {
  const mode = detectMode()

  registerLegacyListeners()

  if (mode === 'modern') {
    window.startOverlayEvents?.()
    return
  }

  if (mode === 'mock') {
    devStart()
  }
}

export function stopEvents(): void {
  devStop()
}

// ─── Dev Mock ─────────────────────────────────────────────────────────────────

type AnyCallback = EventCallback<EventName>
const devListeners = new Map<EventName, Set<AnyCallback>>()
let devIntervalId: ReturnType<typeof setInterval> | null = null
let devPullIndex = 0

function devAddListener(event: EventName, cb: AnyCallback): void {
  if (!devListeners.has(event)) devListeners.set(event, new Set())
  devListeners.get(event)!.add(cb)
}

function devRemoveListener(event: EventName, cb: AnyCallback): void {
  devListeners.get(event)?.delete(cb)
}

async function devCallHandler(params: Record<string, unknown>): Promise<unknown> {
  const call = params.call as string
  if (call === 'saveData') {
    const key = params.key as string
    localStorage.setItem(`act-flexi:saveData:${key}`, params.data as string)
    return { status: 'ok' }
  }
  if (call === 'loadData') {
    const key = params.key as string
    return { data: localStorage.getItem(`act-flexi:saveData:${key}`) }
  }
  if (call === 'broadcast') return null
  return null
}

function devStart(): void {
  emit('ChangeZone', { type: 'ChangeZone', zoneID: 1001, zoneName: 'The Omega Protocol (Ultimate)' })
  emit('ChangePrimaryPlayer', { type: 'ChangePrimaryPlayer', charID: 1, charName: 'Tester McTestface' })
  emit('PartyChanged', {
    type: 'PartyChanged',
    party: MOCK_COMBATANTS.map((c, i) => ({
      id: i + 1,
      name: c.name,
      worldId: 73,
      job: c.job,
      inParty: true,
    })),
  })

  devPullIndex++
  emit('CombatData', buildMockCombatData())

  devIntervalId = setInterval(() => {
    devPullIndex++
    emit('CombatData', buildMockCombatData())
  }, 1000)
}

function devStop(): void {
  if (devIntervalId) {
    clearInterval(devIntervalId)
    devIntervalId = null
  }
}

function emit<K extends EventName>(event: K, data: OverlayEventMap[K]): void {
  devListeners.get(event)?.forEach(cb => (cb as EventCallback<K>)(data))
}

const MOCK_COMBATANTS: Array<{ name: string; job: string; baseDps: number; baseHps: number }> = [
  { name: 'Tester McTestface', job: 'WAR', baseDps: 28500, baseHps: 1200 },
  { name: 'Healy Healface',    job: 'WHM', baseDps: 4200,  baseHps: 18000 },
  { name: 'Stabby McStab',     job: 'NIN', baseDps: 31200, baseHps: 800 },
  { name: 'Draggy Von Dragon', job: 'DRG', baseDps: 29800, baseHps: 650 },
  { name: 'Tanky McTankface',  job: 'PLD', baseDps: 19500, baseHps: 4200 },
  { name: 'Astro Gal',         job: 'AST', baseDps: 5100,  baseHps: 16500 },
  { name: 'Blm Boi',           job: 'BLM', baseDps: 33100, baseHps: 400 },
  { name: 'Sammy Samface',     job: 'SAM', baseDps: 32400, baseHps: 500 },
]

export const MOCK_NAMES = MOCK_COMBATANTS.map(c => c.name)

function buildMockCombatData(): CombatDataEvent {
  const variance = () => 1 + (Math.random() - 0.5) * 0.05

  const combatants = MOCK_COMBATANTS.map(c => ({
    ...c,
    dps: Math.round(c.baseDps * variance()),
    hps: Math.round(c.baseHps * variance()),
  }))

  const totalDps = combatants.reduce((s, c) => s + c.dps, 0)
  const totalHps = combatants.reduce((s, c) => s + c.hps, 0)

  const Combatant: Record<string, Record<string, string>> = {}
  combatants.forEach((c, i) => {
    Combatant[c.name] = {
      name: c.name,
      Job: c.job,
      encdps: String(c.dps),
      enchps: String(c.hps),
      'damage%': ((c.dps / totalDps) * 100).toFixed(1),
      'healed%': ((c.hps / totalHps) * 100).toFixed(1),
      'crithit%': (18 + Math.random() * 10).toFixed(1),
      'DirectHitPct': (20 + Math.random() * 15).toFixed(1),
      tohit: '98.5',
      deaths: String(i === 2 ? 1 : 0),
      maxhit: `Fell Cleave-${Math.round(45000 * variance())}`,
      MAXHIT: `Fell Cleave-${Math.round(45000 * variance())}`,
    }
  })

  return {
    type: 'CombatData',
    isActive: 'true',
    Encounter: {
      title: 'The Omega Protocol (Ultimate)',
      duration: formatDuration(devPullIndex),
      ENCDPS: String(totalDps),
      ENCHPS: String(totalHps),
    },
    Combatant,
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
