import type { Job, Role } from './configSchema'
import { JOB_ICONS } from './jobIcons'

export interface JobInfo {
  role: Role
  label: string       // full display name
  icon: string        // filename in assets/jobs/, e.g. 'WAR.png'
}

export const JOB_MAP: Record<Job, JobInfo> = {
  // ── Tanks ────────────────────────────────────────────────────────────────
  PLD: { role: 'tank',    label: 'Paladin',        icon: 'PLD.png' },
  WAR: { role: 'tank',    label: 'Warrior',         icon: 'WAR.png' },
  DRK: { role: 'tank',    label: 'Dark Knight',     icon: 'DRK.png' },
  GNB: { role: 'tank',    label: 'Gunbreaker',      icon: 'GNB.png' },

  // ── Healers ──────────────────────────────────────────────────────────────
  WHM: { role: 'healer',  label: 'White Mage',      icon: 'WHM.png' },
  SCH: { role: 'healer',  label: 'Scholar',          icon: 'SCH.png' },
  AST: { role: 'healer',  label: 'Astrologian',      icon: 'AST.png' },
  SGE: { role: 'healer',  label: 'Sage',             icon: 'SGE.png' },

  // ── Melee DPS ────────────────────────────────────────────────────────────
  MNK: { role: 'melee',   label: 'Monk',             icon: 'MNK.png' },
  DRG: { role: 'melee',   label: 'Dragoon',          icon: 'DRG.png' },
  NIN: { role: 'melee',   label: 'Ninja',            icon: 'NIN.png' },
  SAM: { role: 'melee',   label: 'Samurai',          icon: 'SAM.png' },
  RPR: { role: 'melee',   label: 'Reaper',           icon: 'RPR.png' },
  VPR: { role: 'melee',   label: 'Viper',            icon: 'VPR.png' },

  // ── Ranged DPS ───────────────────────────────────────────────────────────
  BRD: { role: 'ranged',  label: 'Bard',             icon: 'BRD.png' },
  MCH: { role: 'ranged',  label: 'Machinist',        icon: 'MCH.png' },
  DNC: { role: 'ranged',  label: 'Dancer',           icon: 'DNC.png' },

  // ── Caster DPS ───────────────────────────────────────────────────────────
  BLM: { role: 'caster',  label: 'Black Mage',       icon: 'BLM.png' },
  SMN: { role: 'caster',  label: 'Summoner',         icon: 'SMN.png' },
  RDM: { role: 'caster',  label: 'Red Mage',         icon: 'RDM.png' },
  PCT: { role: 'caster',  label: 'Pictomancer',      icon: 'PCT.png' },
  BLU: { role: 'caster',  label: 'Blue Mage',        icon: 'BLU.png' },

  // ── Crafters (non-combat, treated as unknown) ─────────────────────────────
  CRP: { role: 'unknown', label: 'Carpenter',        icon: 'CRP.png' },
  BSM: { role: 'unknown', label: 'Blacksmith',       icon: 'BSM.png' },
  ARM: { role: 'unknown', label: 'Armorer',          icon: 'ARM.png' },
  GSM: { role: 'unknown', label: 'Goldsmith',        icon: 'GSM.png' },
  LTW: { role: 'unknown', label: 'Leatherworker',    icon: 'LTW.png' },
  WVR: { role: 'unknown', label: 'Weaver',           icon: 'WVR.png' },
  ALC: { role: 'unknown', label: 'Alchemist',        icon: 'ALC.png' },
  CUL: { role: 'unknown', label: 'Culinarian',       icon: 'CUL.png' },

  // ── Gatherers (non-combat, treated as unknown) ────────────────────────────
  MIN: { role: 'unknown', label: 'Miner',            icon: 'MIN.png' },
  BTN: { role: 'unknown', label: 'Botanist',         icon: 'BTN.png' },
  FSH: { role: 'unknown', label: 'Fisher',           icon: 'FSH.png' },

  // ── Special ───────────────────────────────────────────────────────────────
  LB:  { role: 'unknown', label: 'Limit Break',      icon: 'LB.png' },

  // ── Fallback ──────────────────────────────────────────────────────────────
  ADV: { role: 'unknown', label: 'Adventurer',       icon: 'ADV.png' },
}

/** Normalize ACT job strings (e.g. "Limit Break") to abbreviations */
const JOB_ALIASES: Record<string, string> = {
  'LIMIT BREAK': 'LB',
}

export function normalizeJob(raw: string): string {
  const upper = raw.toUpperCase()
  return JOB_ALIASES[upper] ?? raw
}

export function getJobInfo(abbrev: string): JobInfo {
  const key = abbrev.toUpperCase() as Job
  return JOB_MAP[key] ?? { role: 'unknown', label: abbrev, icon: 'ADV.png' }
}

export function getRole(abbrev: string): Role {
  return getJobInfo(abbrev).role
}


export function getJobIconSrc(abbrev: string): string {
  const key = abbrev.toUpperCase()
  return JOB_ICONS[key] ?? JOB_ICONS['ADV'] ?? ''
}
