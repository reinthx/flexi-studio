import type { BarStyle, GlobalConfig, Profile } from './configSchema'
import { CROWN_CUTE_SRC } from './crownAssets'

// ─── Role colors ──────────────────────────────────────────────────────────────

const ROLE_COLORS = {
  tank:    '#4a90d9',
  healer:  '#52b788',
  melee:   '#e63946',
  ranged:  '#f4a261',
  caster:  '#9b5de5',
  unknown: '#888888',
}

const JOB_COLORS: Record<string, string> = {
  PLD: '#A6D100', WAR: '#D30000', DRK: '#B080D0', GNB: '#F0C040',
  WHM: '#B5D0A0', SCH: '#E080B0', AST: '#F0E080', SGE: '#80C0F0',
  MNK: '#E08040', DRG: '#5040A0', NIN: '#A04080', SAM: '#E04040', RPR: '#8040A0', VPR: '#40A040',
  BRD: '#A0C040', MCH: '#6080C0', DNC: '#E060A0',
  BLM: '#8060C0', SMN: '#40A040', RDM: '#E04040', PCT: '#F0A040', BLU: '#40A0C0',
  LB: '#FFD700',
}
export { JOB_COLORS }

// ─── Default bar style ────────────────────────────────────────────────────────

export const DEFAULT_BAR_STYLE: BarStyle = {
  fill: { type: 'solid', color: '#4a90d9', override: false, applyJobColor: false, applyRoleColor: false },
  bg:   { type: 'solid', color: '#1a1a2e', override: false, applyJobColor: false, applyRoleColor: false },
  shape: {
    leftEdge: 'flat',
    rightEdge: 'flat',
    edgeDepth: 10,
    chamferMode: 'none',
    cornerCuts: { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } },
    borderRadius: { tl: 3, tr: 3, br: 3, bl: 3 },
    outline: {
      color: 'rgba(255,255,255,0.15)',
      thickness: { top: 0, right: 0, bottom: 1, left: 0 },
    },
  },
  label: {
    font: 'Segoe UI',
    size: 12,
    color: '#ffffff',
    fields: [
      { id: 'f1', template: '{name}', hAnchor: 'left',  vAnchor: 'middle', offsetX: 0, offsetY: 0, enabled: true },
      { id: 'f2', template: '{value} ({pct})', hAnchor: 'right', vAnchor: 'middle', offsetX: 0, offsetY: 0, enabled: true },
    ],
    shadow:  { enabled: true,  color: '#000000', blur: 2, offsetX: 0, offsetY: 1, thickness: 1 },
    outline: { enabled: false, color: '#000000', width: 1, gradient: null },
    iconConfig: {
      sizeOverride: 0,
      opacity: 1,
      show: true,
      separateRow: false,
      offsetX: 0,
      offsetY: 0,
      shadow: { enabled: false, color: '#000000', blur: 4, offsetX: 0, offsetY: 1 },
      bgShape: { enabled: false, shape: 'circle', color: '#000000', size: 24, opacity: 0.5, offsetX: 0, offsetY: 0 },
    },
    textTransform: 'none',
    padding: 4,
    gap: 4,
    gradient: null,
    separateRowDeaths: false,
    deathOffsetX: 0,
    deathOffsetY: 0,
    deathSize: 12,
    deathOpacity: 1,
  },
  height: 28,
  gap: 2,
}

// ─── Default global config ────────────────────────────────────────────────────

export const DEFAULT_GLOBAL: GlobalConfig = {
  dpsType: 'encdps',
  sortBy: 'encdps',
  maxCombatants: 72,
  showHeader: true,
  transitionDuration: 800,
  holdDuration: 12000,
  orientation: 'vertical',
  opacity: 1,
  outOfCombat: 'dim',
  outOfCombatOpacity: 0.4,
  valueFormat: 'abbreviated',
  combatantFilter: 'all',
  partyOnly: false,
  selfOnly: false,
  blurNames: false,
  windowOpacity: 1,
  windowBorder: {
    enabled: false,
    color: '#2a2a3e',
    width: 1,
    radius: 4,
  },
  windowShadow: {
    enabled: false,
    color: 'rgba(0,0,0,0.5)',
    blur: 8,
    offsetX: 0,
    offsetY: 2,
  },
  windowBg: 'transparent',
  windowBackground: { type:'solid', color: 'transparent' },
  mergePets: true,
  header: {
    show: true,
    template: '{encounter}  {duration}',
    font: 'Segoe UI',
    size: 11,
    color: '#cccccc',
    background: { type: 'solid', color: '#0d0d1a' },
    borderRadius: 4,
    pinned: true,
  },
  footer: {
    show: false,
    template: 'Total: {totalDPS} DPS',
    font: 'Segoe UI',
    size: 11,
    color: '#cccccc',
    background: { type: 'solid', color: '#0d0d1a' },
    borderRadius: 4,
    pinned: true,
  },
  rankIndicator: {
    rank1Enabled: false,
    rank1Style: {},
    showNumbers: false,
    rank1HeightIncrease: 0,
    rank1ShowCrown: false,
    rank1Crown: { enabled: false, icon: '👑', imageUrl: CROWN_CUTE_SRC, size: 20, offsetX: 2, offsetY: 0, rotation: 0, hAnchor: 'left', vAnchor: 'middle' },
    rank1Glow: { enabled: false, color: '#FFD700', blur: 8 },
    rank1NameStyle: { enabled: false },
  },
  pets: {
    show: false,
    mergeWithOwner: true,
    petStyle: {},
  },
  tabsEnabled: false,
  tabs: [],
  activeTab: 'dps',
  tabsPinned: true,
}

// ─── Rank #1 Themes ───────────────────────────────────────────────────────────────

export const RANK1_THEMES = {
  goldCrown: {
    label: 'Gold Crown',
    rank1Style: {
      fill: { type: 'solid', color: '#FFD700' },
      bg: { type: 'solid', color: '#1a1a2e' },
    },
    rank1HeightIncrease: 4,
    rank1ShowCrown: true,
    rank1Crown: { enabled: true, icon: '👑', imageUrl: CROWN_CUTE_SRC, size: 20, offsetX: 2, offsetY: 0, rotation: 0, hAnchor: 'left', vAnchor: 'middle' },
    rank1Glow: { enabled: false, color: '#FFD700', blur: 8 },
    rank1NameStyle: { enabled: false },
  },
  glowingGold: {
    label: 'Glowing Gold',
    rank1Style: {
      fill: { type: 'solid', color: '#FFD700' },
      bg: { type: 'solid', color: '#1a1a2e' },
    },
    rank1HeightIncrease: 4,
    rank1ShowCrown: false,
    rank1Crown: { enabled: false, icon: '👑', imageUrl: CROWN_CUTE_SRC, size: 20, offsetX: 2, offsetY: 0, rotation: 0, hAnchor: 'left', vAnchor: 'middle' },
    rank1Glow: { enabled: true, color: '#FFD700', blur: 12 },
    rank1NameStyle: { enabled: false },
  },
  rubyWinner: {
    label: 'Ruby Winner',
    rank1Style: {
      fill: { type: 'solid', color: '#E63946' },
      bg: { type: 'solid', color: '#1a1a2e' },
    },
    rank1HeightIncrease: 4,
    rank1ShowCrown: true,
    rank1Crown: { enabled: true, icon: '👑', imageUrl: CROWN_CUTE_SRC, size: 20, offsetX: 2, offsetY: 0, rotation: 0, hAnchor: 'left', vAnchor: 'middle' },
    rank1Glow: { enabled: true, color: '#E63946', blur: 8 },
  },
  neonWinner: {
    label: 'Neon Winner',
    rank1Style: {
      fill: {
        type: 'gradient',
        gradient: {
          type: 'linear',
          angle: 90,
          stops: [
            { position: 0, color: '#00FFFF' },
            { position: 1, color: '#00FF00' },
          ],
        },
      },
      bg: { type: 'solid', color: '#0a0a1a' },
    },
    rank1HeightIncrease: 4,
    rank1ShowCrown: true,
    rank1Crown: { enabled: true, icon: '👑', imageUrl: CROWN_CUTE_SRC, size: 20, offsetX: 2, offsetY: 0, rotation: 0, hAnchor: 'left', vAnchor: 'middle' },
    rank1Glow: { enabled: true, color: '#00FFFF', blur: 10 },
  },
  minimalGold: {
    label: 'Minimal Gold',
    rank1Style: {
      fill: { type: 'solid', color: '#FFD700' },
    },
    rank1HeightIncrease: 0,
    rank1ShowCrown: false,
    rank1Crown: { enabled: false, icon: '👑', imageUrl: CROWN_CUTE_SRC, size: 20, offsetX: 2, offsetY: 0, rotation: 0, hAnchor: 'left', vAnchor: 'middle' },
    rank1Glow: { enabled: false, color: '#FFD700', blur: 8 },
    rank1NameStyle: { enabled: false },
  },
  iceChampion: {
    label: 'Ice Champion',
    rank1Style: {
      fill: {
        type: 'gradient',
        gradient: {
          type: 'linear',
          angle: 90,
          stops: [
            { position: 0, color: '#E0F7FA' },
            { position: 1, color: '#4FC3F7' },
          ],
        },
      },
      bg: { type: 'solid', color: '#0a1a2a' },
    },
    rank1HeightIncrease: 4,
    rank1ShowCrown: true,
    rank1Crown: { enabled: true, icon: '👑', imageUrl: CROWN_CUTE_SRC, size: 20, offsetX: 2, offsetY: 0, rotation: 0, hAnchor: 'left', vAnchor: 'middle' },
    rank1Glow: { enabled: true, color: '#4FC3F7', blur: 10 },
  },
}

// ─── Default profile — role colors preset ─────────────────────────────────────

export const DEFAULT_PROFILE: Profile = {
  id: 'default',
  name: 'Default',
  default: DEFAULT_BAR_STYLE,
  customIcons: {},
  overrides: {
    byRole: {
      tank:    { fill: { type: 'solid', color: ROLE_COLORS.tank    } },
      healer:  { fill: { type: 'solid', color: ROLE_COLORS.healer  } },
      melee:   { fill: { type: 'solid', color: ROLE_COLORS.melee   } },
      ranged:  { fill: { type: 'solid', color: ROLE_COLORS.ranged  } },
      caster:  { fill: { type: 'solid', color: ROLE_COLORS.caster  } },
    },
    byRoleEnabled: {
      tank: true,
      healer: true,
      melee: true,
      ranged: true,
      caster: true,
    },
    byJob: {
      PLD: { fill: { type: 'solid', color: JOB_COLORS.PLD } },
      WAR: { fill: { type: 'solid', color: JOB_COLORS.WAR } },
      DRK: { fill: { type: 'solid', color: JOB_COLORS.DRK } },
      GNB: { fill: { type: 'solid', color: JOB_COLORS.GNB } },
      WHM: { fill: { type: 'solid', color: JOB_COLORS.WHM } },
      SCH: { fill: { type: 'solid', color: JOB_COLORS.SCH } },
      AST: { fill: { type: 'solid', color: JOB_COLORS.AST } },
      SGE: { fill: { type: 'solid', color: JOB_COLORS.SGE } },
      MNK: { fill: { type: 'solid', color: JOB_COLORS.MNK } },
      DRG: { fill: { type: 'solid', color: JOB_COLORS.DRG } },
      NIN: { fill: { type: 'solid', color: JOB_COLORS.NIN } },
      SAM: { fill: { type: 'solid', color: JOB_COLORS.SAM } },
      RPR: { fill: { type: 'solid', color: JOB_COLORS.RPR } },
      VPR: { fill: { type: 'solid', color: JOB_COLORS.VPR } },
      BRD: { fill: { type: 'solid', color: JOB_COLORS.BRD } },
      MCH: { fill: { type: 'solid', color: JOB_COLORS.MCH } },
      DNC: { fill: { type: 'solid', color: JOB_COLORS.DNC } },
      BLM: { fill: { type: 'solid', color: JOB_COLORS.BLM } },
      SMN: { fill: { type: 'solid', color: JOB_COLORS.SMN } },
      RDM: { fill: { type: 'solid', color: JOB_COLORS.RDM } },
      PCT: { fill: { type: 'solid', color: JOB_COLORS.PCT } },
      BLU: { fill: { type: 'solid', color: JOB_COLORS.BLU } },
    },
    byJobEnabled: {
      PLD: true, WAR: true, DRK: true, GNB: true,
      WHM: true, SCH: true, AST: true, SGE: true,
      MNK: true, DRG: true, NIN: true, SAM: true, RPR: true, VPR: true,
      BRD: true, MCH: true, DNC: true,
      BLM: true, SMN: true, RDM: true, PCT: true, BLU: true,
    },
    self: {
      // Change both outline and fill for the self bar
      fill: { type: 'solid', color: '#FFD700' },
      shape: {
        outline: {
          color: '#ffffff',
          thickness: { top: 1, right: 1, bottom: 1, left: 1 },
        },
      } as any,
    },
    selfEnabled: true,
  },
  global: DEFAULT_GLOBAL,
}
