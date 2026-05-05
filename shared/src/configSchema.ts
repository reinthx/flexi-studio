// ─── Fill ─────────────────────────────────────────────────────────────────────

export interface GradientStop {
  position: number  // 0–1
  color: string     // CSS color string (hex, rgba, etc.)
}

export type GradientAnimationAngleRotation = 'none' | 'continuous' | 'oscillate'
export type GradientAnimationScrollDirection = 'none' | 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'

export interface GradientAnimation {
  enabled: boolean
  angleRotation: GradientAnimationAngleRotation
  angleRotationSpeed: number  // 1–10
  angleRotationDirection: 'clockwise' | 'counter-clockwise'
  scrollDirection: GradientAnimationScrollDirection
  scrollSpeed: number  // 1–10
  shimmerEnabled: boolean
  shimmerSpeed: number  // 1–10
  shimmerWidth: number  // percentage of bar (10–50)
}

export interface GradientFill {
  type: 'linear' | 'radial'
  angle: number      // degrees, used for linear
  stops: GradientStop[]  // 2–6 stops supported
  animation?: GradientAnimation
}

export interface TexturePagination {
  enabled: boolean
  startOffsetX: number  // px — starting X offset for the texture
  startOffsetY: number  // px — starting Y offset for the texture
}

export interface TextureFill {
  src: string        // base64 data URL (WebP, max ~512px)
  repeat: 'repeat' | 'no-repeat' | 'stretch' | 'paginate'
  opacity: number    // 0–1
  blendMode: string  // CSS mix-blend-mode value
  tintColor?: string    // optional solid color tint (multiply blend)
  tintGradient?: GradientFill  // optional gradient tint (multiply blend, overrides tintColor)
  pagination?: TexturePagination
}

export type BarFill =
  | { type: 'solid';   color: string; opacity?: number; override?: boolean; applyJobColor?: boolean; applyRoleColor?: boolean }
  | { type: 'gradient'; gradient: GradientFill; opacity?: number; override?: boolean; applyJobColor?: boolean; applyRoleColor?: boolean }
  | { type: 'texture';  texture: TextureFill; opacity?: number; override?: boolean; applyJobColor?: boolean; applyRoleColor?: boolean }

// ─── Shape ────────────────────────────────────────────────────────────────────

export interface BorderRadius {
  tl: number
  tr: number
  br: number
  bl: number
}

export interface PerSideThickness {
  top: number
  right: number
  bottom: number
  left: number
}

export interface BarOutline {
  color: string
  thickness: PerSideThickness
  target?: 'bg' | 'fill' | 'both'  // default 'both'
}

export interface BarBackgroundStroke {
  enabled: boolean
  color: string
  width: number
}

export interface BarShadow {
  enabled: boolean
  color: string
  blur: number
  thickness: number
  offsetX: number
  offsetY: number
}

export interface CornerCut {
  x: number  // horizontal offset px — creates diagonal cut from (x,0) to (0,y)
  y: number  // vertical offset px
}

export interface CornerCuts {
  tl: CornerCut
  tr: CornerCut
  br: CornerCut
  bl: CornerCut
}

/**
 * Per-side edge style for a bar shape.
 *
 * Left side (TL → BL, d = edgeDepth px):
 *   flat     → straight vertical at x=0
 *   point    → chevron pointing left  — TL=(d,0)  mid=(0,50%)  BL=(d,100%)   → ▷
 *   slant-a  → top shifts right       — TL=(d,0)  BL=(0,100%)               → / lean
 *   slant-b  → bottom shifts right    — TL=(0,0)  BL=(d,100%)               → \ lean
 *
 * Right side (TR → BR, mirror):
 *   flat     → straight vertical at 100%
 *   point    → chevron pointing right — TR=(100%-d,0)  mid=(100%,50%)  BR=(100%-d,100%)  → ◁
 *   slant-a  → top stays, bottom left — TR=(100%,0)    BR=(100%-d,100%)                  → \ lean
 *   slant-b  → top shifts left        — TR=(100%-d,0)  BR=(100%,100%)                    → / lean
 *
 * Useful combinations:
 *   L:point  + R:flat    → bar points right  ▷
 *   L:flat   + R:point   → bar points left   ◁
 *   L:point  + R:point   → double chevron    ◇
 *   L:slant-a + R:slant-a → parallelogram    ▱
 *   L:slant-a + R:flat    → left trapezoid
 *   L:flat   + R:slant-a  → right trapezoid
 */
export type EdgeType = 'flat' | 'point' | 'slant-a' | 'slant-b'

export interface BarShape {
  leftEdge: EdgeType
  rightEdge: EdgeType
  edgeDepth: number           // px — depth for point and slant modes
  edgeDepthLeft?: number      // optional per-side depth
  edgeDepthRight?: number     // optional per-side depth
  chamferMode?: 'none' | 'left' | 'right' | 'both'  // default 'none'
  borderRadius: BorderRadius  // used only when both edges are flat (no chamfer)
  cornerCuts: CornerCuts      // chamfer — when any corner has both x+y > 0, overrides polygon
  outline: BarOutline
  bgStroke?: BarBackgroundStroke
  shadow?: BarShadow          // background bar shadow
  fillShadow?: BarShadow      // fill bar shadow (polish effect)
  fillInsetTop?: number       // px — push fill down from top (name-above-bar layout)
  segmentFill?: {
    enabled: boolean
    segmentWidth: number      // px — width of each filled segment (default 8)
    gap: number               // px — gap between segments (default 2)
    angle?: number            // degrees — 90 = vertical cuts (left-to-right bar), 0 = horizontal cuts (rising bar), between = skewed (default 90)
    startHeight?: number      // px — height of first (leftmost) segment; enables growing-segment mode
    endHeight?: number        // px — height of last (rightmost) segment; enables growing-segment mode
  }
}

// ─── Label ────────────────────────────────────────────────────────────────────

export interface LabelShadow {
  enabled: boolean
  color: string
  blur: number
  offsetX: number
  offsetY: number
  thickness?: number
}

export interface LabelOutline {
  enabled: boolean
  color: string
  width: number  // px, maps to -webkit-text-stroke
  gradient: GradientFill | null  // gradient outline (null = disabled, uses solid color)
}

export interface IconShadow {
  enabled: boolean
  color: string
  blur: number
  offsetX: number
  offsetY: number
  thickness?: number
}

export interface IconConfig {
  sizeOverride: number   // 0 = auto (1.4 × label font size)
  opacity: number        // 0–1
  shadow: IconShadow
  show: boolean          // toggle icon visibility
  separateRow: boolean   // render icon on its own row above the bar
  offsetX: number        // horizontal offset in px (positive = right, negative = left)
  offsetY: number        // vertical offset in px (positive = down, negative = up)
  rotation?: number      // degrees (0 = upright, positive = clockwise)
  bgShape: {
    enabled: boolean
    shape: 'circle' | 'square' | 'rounded' | 'diamond'
    color: string
    size: number         // px — size of the bg shape
    opacity: number      // 0–1
    offsetX: number      // px — horizontal offset
    offsetY: number      // px — vertical offset
  }
  outline?: {
    enabled: boolean
    color: string
    width: number        // px
  }
  classOutline?: {
    enabled: boolean
    color?: string         // optional — when omitted, uses job role color
    width: number          // px
  }
}

// ─── Label Fields ─────────────────────────────────────────────────────────────

export interface LabelField {
  id: string                              // stable key for v-for
  template: string                        // e.g. "{icon} {name}", "{value} ({pct})"
  hAnchor: 'left' | 'center' | 'right'   // horizontal anchor point
  vAnchor: 'top' | 'middle' | 'bottom'   // vertical anchor point
  growsFrom?: 'left' | 'center' | 'right' // which edge of the text element sits at the anchor point (left=grows right, right=grows left, center=grows both)
  valueFormat?: ValueFormat               // per-field override for numeric token formatting (undefined = inherit global)
  offsetX: number                         // px offset from anchor (positive = right/left)
  offsetY: number                         // px offset from anchor (positive = down/up)
  enabled: boolean
  opacity?: number                        // 0–1, field-level opacity (undefined = 1.0)
  // Per-field style overrides (optional — falls back to BarLabel globals when absent)
  font?: string                           // override global label font
  fontSize?: number                       // px — override global label size (0 = use global)
  colorMode?: 'custom' | 'job' | 'role'   // color override mode (absent = no override)
  color?: string                          // used when colorMode === 'custom'
  gradient?: { type: 'linear' | 'radial'; angle?: number; stops: Array<{ color: string; position: number }> }  // custom: full stops; job/role: stops[1].color = Color 2 (Color 1 from StyleOverrides dynamically)
  selfMode?: boolean                      // when true, override color with Self override color when bar.isSelf === true (combinable with colorMode)
  selfGradient?: { type: 'linear' | 'radial'; angle?: number; stops: Array<{ color: string; position: number }> }  // self gradient: stops[1].color = Color 2; Color 1 from StyleOverrides.self dynamically
  maxWidth?: number                       // px — cap field width (0 = auto, uses 100% - padding*2)
  autoRotation?: boolean                  // when true, auto-rotate field to keep it on top of the bar (only for horizontal bars with vertical offset, and when rotation is not manually set)
  autoRotationRatio?: number           // width ratio for auto-rotation calc (default 100)
  rotation?: number                    // degrees (0 = no rotation, 0-360)
}

export interface BarLabel {
  font: string
  size: number          // px
  color: string
  fields: LabelField[]  // up to 5 text fields, each positioned independently
  shadow: LabelShadow
  outline: LabelOutline
  iconConfig: IconConfig
  // Styling
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  padding: number       // px — minimum distance from bar edges to field anchors
  gap: number           // px — gap between icon and text within a field
  gradient: GradientFill | null  // gradient text (null = disabled)
  // Deaths
  separateRowDeaths: boolean
  deathOffsetX: number    // px — horizontal offset for death indicator
  deathOffsetY: number    // px — vertical offset for death indicator
  deathSize: number       // px — font size of death indicator
  deathOpacity: number    // 0–1
}

// ─── Tab Config ───────────────────────────────────────────────────────────────

export interface TabConfig {
  id: string           // stable key, e.g. "dps", "hps", "dtps"
  label: string        // display name for tab button, e.g. "DPS", "HPS"
  dpsType: DpsType     // which metric drives sorting and values
  labelConfig: BarLabel  // per-tab label configuration
  enabled: boolean     // individual tab on/off toggle
}

// Available template tokens (for editor token picker):
// {name} {job} {icon} {rank} {value} {pct} {deaths} {crithit%} {tohit%} {enchps} {damage%}

// ─── Bar Style ────────────────────────────────────────────────────────────────

export type MetricStripSource = 'current' | DpsType | 'threat'

export interface MetricStripConfig {
  enabled: boolean
  source: MetricStripSource
  height: number
  width?: number
  offsetX?: number
  fill: BarFill
  fillSource?: 'custom' | 'bar' | 'background'
  bg?: BarFill
  bgSource?: 'custom' | 'bar' | 'background' | 'none'
  inheritShape?: boolean
  inheritShadow?: boolean
  opacity: number
  anchor: 'top' | 'bottom'
  placement?: 'inside' | 'outside'
  gap?: number
}

export interface BarStyle {
  fill: BarFill    // foreground (the value portion)
  bg: BarFill      // background (the empty portion)
  shape: BarShape
  label: BarLabel
  metricStrip?: MetricStripConfig
  height: number   // px — bar height in vertical mode, bar width in horizontal mode
  horizontalHeight?: number  // px — bar height/length in horizontal mode
  gap: number      // px — spacing between bars
}

// ─── Jobs & Roles ─────────────────────────────────────────────────────────────

export type Role = 'tank' | 'healer' | 'melee' | 'ranged' | 'caster' | 'unknown'

export type Job =
  // Tanks
  | 'PLD' | 'WAR' | 'DRK' | 'GNB'
  // Healers
  | 'WHM' | 'SCH' | 'AST' | 'SGE'
  // Melee DPS
  | 'MNK' | 'DRG' | 'NIN' | 'SAM' | 'RPR' | 'VPR'
  // Ranged DPS
  | 'BRD' | 'MCH' | 'DNC'
  // Caster DPS
  | 'BLM' | 'SMN' | 'RDM' | 'PCT' | 'BLU'
  // Non-combat / fallback
  | 'CRP' | 'BSM' | 'ARM' | 'GSM' | 'LTW' | 'WVR' | 'ALC' | 'CUL'
  | 'MIN' | 'BTN' | 'FSH'
  | 'ADV'  // Adventurer (unknown job)
  | 'LB'   // Limit Break

// ─── Style Overrides ──────────────────────────────────────────────────────────

export interface StyleOverrides {
  byRole: Partial<Record<Role, Partial<BarStyle> & { gradientColor?: string }>>
  byRoleEnabled: Partial<Record<Role, boolean>>
  byJob:  Partial<Record<Job,  Partial<BarStyle> & { gradientColor?: string }>>
  byJobEnabled: Partial<Record<Job, boolean>>
  self:   (Partial<BarStyle> & { gradientColor?: string }) | null
  selfEnabled: boolean
}

// ─── Rank Indicator ───────────────────────────────────────────────────────────

export interface RankGlow {
  enabled: boolean
  color: string
  blur: number
}

export interface RankCrown {
  enabled: boolean
  icon: string      // emoji or text fallback
  imageUrl: string  // base64 data URL or https URL (overrides icon when set)
  size: number      // px
  offsetX: number
  offsetY: number
  rotation: number  // degrees (0 = upright, positive = clockwise)
  hAnchor: 'left' | 'right' | 'center'
  vAnchor: 'top' | 'middle' | 'bottom'
}

export interface RankNameStyle {
  enabled: boolean
  gradient?: {
    type: 'linear' | 'radial'
    angle: number
    stops: Array<{ color: string; position: number }>
  }
}

export interface Rank1IconStyle {
  enabled: boolean
  glow?: {
    enabled: boolean
    color: string
    blur: number
  }
  shadow?: {
    enabled: boolean
    color: string
    blur: number   // px — applied as drop-shadow glow
  }
  bgShape?: {
    enabled: boolean
    shape: 'circle' | 'square' | 'rounded' | 'diamond'
    color: string
    size: number    // px
    opacity: number // 0–1
    offsetX: number
    offsetY: number
  }
}

export interface RankIndicatorConfig {
  rank1Enabled: boolean
  rank1StyleEnabled?: boolean  // when false, skip bar fill override (default true)
  rank1Style: Partial<BarStyle>
  showNumbers: boolean  // render {rank} token on all bars, not just #1
  rank1HeightIncrease: number  // percentage increase (e.g., 4 = +4%)
  rank1ShowCrown: boolean  // show crown icon on rank 1
  rank1Crown: RankCrown
  rank1Glow: RankGlow
  rank1NameStyle?: RankNameStyle
  rank1IconStyle?: Rank1IconStyle  // icon overrides for rank 1 bar
}

// ─── Header / Footer ──────────────────────────────────────────────────────────

// Available tokens: {zone} {encounter} {duration} {totalDPS} {totalHPS} {totalDTPS} {pullNumber} {pullCount}
export interface HeaderConfig {
  show: boolean
  template: string
  font: string
  size: number    // px
  color: string
  background: BarFill
  borderRadius: number  // px - header border radius
  pinned: boolean      // if false, header hides until hover
}

// ─── Pets ─────────────────────────────────────────────────────────────────────

export interface PetConfig {
  show: boolean
  mergeWithOwner: boolean  // default true — adds pet stats to owner and drops pet row
  petStyle: Partial<BarStyle>
}

// ─── Global Config ────────────────────────────────────────────────────────────

export type DpsType = 'encdps' | 'enchps' | 'dtps' | 'rdps' | 'damage%' | 'healed%' | 'crithit%'
export type ValueFormat = 'raw' | 'abbreviated' | 'formatted'
export type Orientation = 'vertical' | 'horizontal'
export type OutOfCombatBehavior = 'show' | 'dim' | 'hide'
export type CombatantFilter = 'all' | 'alliance' | 'party' | 'self'

export interface GlobalConfig {
  dpsType: DpsType
  sortBy: string           // any CombatData combatant field key
  maxCombatants: number
  showHeader: boolean      // header visibility shortcut (also in header.show)
  transitionDuration: number  // ms
  holdDuration: number        // ms before clearing after isActive → false
  orientation: Orientation
  opacity: number             // 0–1, whole overlay transparency
  outOfCombat: OutOfCombatBehavior
  outOfCombatOpacity: number  // used when outOfCombat === 'dim'
  valueFormat: ValueFormat
  combatantFilter: CombatantFilter  // replaces partyOnly/selfOnly
  partyOnly: boolean
  selfOnly: boolean           // minimode: show only local player
  blurNames: boolean           // blur all names except self
  windowBg: string            // CSS color for the meter window background (supports rgba for transparency)
  windowBackground: BarFill   // window panel fill (solid/texture)
  windowOpacity: number       // 0–1, window transparency (same as opacity but separate)
  windowBorder: {
    enabled: boolean
    color: string
    width: number
    radius: number
  }
  windowShadow: {
    enabled: boolean
    color: string
    blur: number
    offsetX: number
    offsetY: number
  }
  mergePets: boolean          // merge pet damage into owner
  tabsEnabled: boolean        // master toggle to enable tab system
  tabs: TabConfig[]          // all available tab configurations
  activeTab: string          // ID of currently selected tab
  tabsPinned: boolean        // whether tabs are always visible (vs. hover to show)
  header: HeaderConfig
  footer: HeaderConfig
  rankIndicator: RankIndicatorConfig
  pets: PetConfig
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  name: string
  default: BarStyle
  overrides: StyleOverrides
  global: GlobalConfig
  customIcons: Partial<Record<string, string>>  // job abbrev → base64 data URL
}

// ─── Pull History ─────────────────────────────────────────────────────────────

export interface CombatantSnapshot {
  name: string
  job: string
  encdps: string
  enchps: string
  'damage%': string
  'healed%': string
  'crithit%': string
  'tohit': string
  deaths: string
  [key: string]: string  // allow other ACT fields
}

export interface EncounterSnapshot {
  title: string
  duration: string
  ENCDPS: string
  ENCHPS: string
  [key: string]: string
}

// Per-ability aggregated stats for one combatant, built from LogLine events (types 21/22).
// Keyed by abilityId within a CombatantAbilityData map.
export interface AbilityStats {
  abilityId: string
  abilityName: string
  totalDamage: number
  overheal?: number
  hits: number
  maxHit: number
  minHit: number
  critHits?: number
  critMinHit?: number
  critMaxHit?: number
  directHits?: number
  directMinHit?: number
  directMaxHit?: number
  critDirectHits?: number
  critDirectMinHit?: number
  critDirectMaxHit?: number
  targets?: Record<string, { total: number; hits: number; overheal?: number }>
  targetInstances?: Record<string, { name: string; id: string; total: number; hits: number; overheal?: number }>
  sources?: Record<string, { total: number; hits: number; overheal?: number }>
}

// [combatantName][abilityId] → AbilityStats
export type CombatantAbilityData = Record<string, AbilityStats>

// DPS timeline: combatantName → damage totals per 3-second bucket (index = bucket #)
// DPS for bucket i = timeline[name][i] / TIMELINE_BUCKET_SEC
export type DpsTimeline = Record<string, number[]>
export const TIMELINE_BUCKET_SEC = 3

export interface HpSample {
  t: number        // ms since pull start
  currentHp: number
  maxHp: number
  hp: number       // 0–1 fraction
}

export interface HitRecord {
  t: number           // ms since pull start
  type: 'dmg' | 'heal'
  abilityName: string
  sourceName: string
  amount: number
  currentHp?: number
  maxHp?: number
  hp?: number
}

export interface DeathEvent {
  t: number
  type: 'dmg' | 'heal' | 'death'
  abilityName: string
  sourceName: string
  amount: number
  hpBefore: number
  hpAfter: number
  hpBeforeRaw: number
  hpAfterRaw: number
  maxHp: number
  isDeathBlow: boolean
  isEstimated?: boolean
}

export interface CastEvent {
  t: number         // ms since pull start
  abilityName: string
  abilityId: string
  source: string
  target: string
  targetId?: string
  type: 'instant' | 'cast' | 'tick'
  durationMs?: number
  endT?: number
  buffDurationMs?: number
  cooldownMs?: number
  effectName?: string
}

export interface ResourceSample {
  t: number         // ms since pull start
  currentHp: number
  maxHp: number
  hp: number        // 0-1
  currentMp?: number
  maxMp?: number
  mp?: number       // 0-1
}

export interface DeathRecord {
  targetName: string
  targetId: string
  timestamp: number  // ms since pull start
  hpSamples: HpSample[]
  lastHits?: HitRecord[]  // damage/heals on this target in the 30s before death
  events?: DeathEvent[]
  resurrectTime?: number  // ms since pull start, when raised (if applicable)
  resurrectSourceName?: string
}

export interface PullRecord {
  id: string
  timestamp: number
  encounterName: string
  zone: string
  duration: string
  combatants: CombatantSnapshot[]
  rawCombatants?: CombatantSnapshot[]
  encounter: EncounterSnapshot
  // Populated from LogLine parsing. Optional: absent on records loaded from older sessions.
  abilityData?: Record<string, CombatantAbilityData>
  dpsTimeline?: DpsTimeline    // damage dealt per combatant over time
  hpsTimeline?: DpsTimeline    // heals dealt per combatant over time
  dtakenTimeline?: DpsTimeline // damage received per combatant over time
  damageTakenData?: Record<string, CombatantAbilityData>  // target name → per-ability received damage
  healingReceivedData?: Record<string, CombatantAbilityData> // target name → per-ability received healing
  hitData?: Record<string, HitRecord[]> // target name → rolling damage/heal events
  rdpsGiven?: Record<string, number> // combatant name -> DPS credited from that actor's raid buffs
  rdpsTaken?: Record<string, number> // combatant name -> DPS removed from damage gained via others' buffs
  deaths?: DeathRecord[]
  enemyDeaths?: Record<string, number> // enemy name -> ms since pull start
  combatantIds?: Record<string, string>  // combatant name → FFXIV object ID
  combatantJobs?: Record<string, string> // combatant name → normalized job abbreviation
  castData?: Record<string, CastEvent[]>  // combatant name → cast events
  resourceData?: Record<string, ResourceSample[]> // combatant name → HP/MP samples over time
  partyData?: PartyMember[]  // party state at time of pull (for historical grouping)
}

// ─── Raw OverlayPlugin event shapes ───────────────────────────────────────────

export interface CombatDataEvent {
  type: 'CombatData'
  isActive: 'true' | 'false'
  Encounter: Record<string, string>
  Combatant: Record<string, Record<string, string>>
}

// Fired by OverlayPlugin (modern mode only) for every network log line from FFXIV.
// rawLine is the full pipe-delimited string; line is the pre-split array.
// Relevant types for ability tracking: 21 (Ability), 22 (AOEAbility), 24 (DoT/HoT),
// 25 (Death), 26 (GainsEffect), 30 (LosesEffect).
export interface LogLineEvent {
  type: 'LogLine'
  rawLine: string
  line: string[]
}

export interface ChangePrimaryPlayerEvent {
  type: 'ChangePrimaryPlayer'
  charID: number
  charName: string
}

export interface ChangeZoneEvent {
  type: 'ChangeZone'
  zoneID: number
  zoneName?: string
}

export interface PartyMember {
  id: number
  name: string
  worldId: number
  job: string
  inParty: boolean
  partyType?: string  // "Party", "AllianceA", "AllianceB", "AllianceC", etc
}

export interface PartyChangedEvent {
  type: 'PartyChanged'
  party: PartyMember[]
}

export interface BroadcastMessageEvent {
  type: 'BroadcastMessage'
  source: string
  msg: unknown
}
