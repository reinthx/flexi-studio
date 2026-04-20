import type { Profile, CombatantSnapshot, GlobalConfig, BarStyle, StyleOverrides, Role, Job } from '../configSchema'
import { DEFAULT_PROFILE, DEFAULT_BAR_STYLE, DEFAULT_GLOBAL } from '../presets'

export function createMockCombatant(partial: Partial<CombatantSnapshot> = {}): CombatantSnapshot {
  return {
    name: 'Test Player',
    job: 'PLD',
    encdps: '1000',
    enchps: '0',
    'damage%': '10.0',
    'healed%': '0.0',
    'crithit%': '25.0',
    'tohit': '90.0',
    deaths: '0',
    ...partial,
  }
}

export function createMockCombatants(count: number, opts: { withPets?: boolean } = {}): Record<string, CombatantSnapshot> {
  const combatants: Record<string, CombatantSnapshot> = {} as Record<string, CombatantSnapshot>

  const jobs = ['PLD', 'WAR', 'WHM', 'BLM', 'BRD'] as const
  for (let i = 0; i < count; i++) {
    const name = `Player${i}`
    combatants[name] = createMockCombatant({
      name,
      job: jobs[i % jobs.length] ?? 'ADV',
      encdps: String(1000 + i * 100),
      'damage%': ((i + 1) * 10).toFixed(1),
    })
  }

  if (opts.withPets) {
    const petName = 'Pet(Player0)'
    combatants[petName] = createMockCombatant({
      name: petName,
      job: 'ADV',
      encdps: '250',
      'damage%': '2.5',
    })
  }

  return combatants
}

export function createMockProfile(partial: Partial<Profile> = {}): Profile {
  return {
    ...DEFAULT_PROFILE,
    ...partial,
  }
}

export function createMockGlobalConfig(partial: Partial<GlobalConfig> = {}): GlobalConfig {
  return {
    ...DEFAULT_GLOBAL,
    ...partial,
  }
}

export function createMockBarStyle(partial: Partial<BarStyle> = {}): BarStyle {
  return {
    ...DEFAULT_BAR_STYLE,
    ...partial,
  }
}

export function createMockStyleOverrides(partial: Partial<StyleOverrides> = {}): StyleOverrides {
  return {
    byRole: {},
    byRoleEnabled: {},
    byJob: {},
    byJobEnabled: {},
    self: null,
    selfEnabled: false,
    ...partial,
  }
}

export function createMockRoleOverrides(): Partial<Record<Role, Partial<BarStyle>>> {
  return {
    tank: { fill: { type: 'solid', color: '#4a90d9' } },
    healer: { fill: { type: 'solid', color: '#52b788' } },
    melee: { fill: { type: 'solid', color: '#e63946' } },
    ranged: { fill: { type: 'solid', color: '#f4a261' } },
    caster: { fill: { type: 'solid', color: '#9b5de5' } },
  }
}

export function createMockJobOverrides(): Partial<Record<Job, Partial<BarStyle>>> {
  return {
    PLD: { fill: { type: 'solid', color: '#A6D100' } },
    WAR: { fill: { type: 'solid', color: '#D30000' } },
    BLM: { fill: { type: 'solid', color: '#8060C0' } },
  }
}