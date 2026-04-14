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
  shadow?: BarShadow          // background bar shadow
  fillShadow?: BarShadow      // fill bar shadow (polish effect)
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
  offsetX: number                         // px offset from anchor (positive = right/left)
  offsetY: number                         // px offset from anchor (positive = down/up)
  enabled: boolean
  opacity?: number                        // 0–1, field-level opacity (undefined = 1.0)
  // Per-field style overrides (optional — falls back to BarLabel globals when absent)
  font?: string                           // override global label font
  fontSize?: number                       // px — override global label size (0 = use global)
  colorMode?: 'custom' | 'job' | 'role' | 'self'  // color override mode (absent = no override)
  color?: string                          // used when colorMode === 'custom'
  selfColor?: string                      // color applied only when bar.isSelf === true (colorMode === 'self')
  maxWidth?: number                       // px — cap field width (0 = auto, uses 100% - padding*2)
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

export interface BarStyle {
  fill: BarFill    // foreground (the value portion)
  bg: BarFill      // background (the empty portion)
  shape: BarShape
  label: BarLabel
  height: number   // px — bar height in vertical mode, bar width in horizontal mode
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
  icon: string  // emoji or text
  imageUrl: string  // custom image URL (overrides icon if set)
  size: number  // px
  offsetX: number
  offsetY: number
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
  glow?: {
    enabled: boolean
    color: string
    blur: number
  }
}

export interface RankIndicatorConfig {
  rank1Enabled: boolean
  rank1Style: Partial<BarStyle>
  showNumbers: boolean  // render {rank} token on all bars, not just #1
  rank1HeightIncrease: number  // percentage increase (e.g., 4 = +4%)
  rank1ShowCrown: boolean  // show crown icon on rank 1
  rank1Crown: RankCrown
  rank1Glow: RankGlow
  rank1NameStyle: RankNameStyle
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

export type DpsType = 'encdps' | 'enchps' | 'dtps' | 'damage%' | 'healed%' | 'crithit%'
export type ValueFormat = 'raw' | 'abbreviated' | 'formatted'
export type Orientation = 'vertical' | 'horizontal'
export type OutOfCombatBehavior = 'show' | 'dim' | 'hide'
export type CombatantFilter = 'all' | 'party' | 'self'

export interface GlobalConfig {
  dpsType: DpsType
  sortBy: string           // any CombatData combatant field key
  maxCombatants: number
  showHeader: boolean      // header visibility shortcut (also in header.show)
  autoScale: boolean
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
  windowX: number             // window position X (px)
  windowY: number             // window position Y (px)
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

export interface PullRecord {
  id: string
  timestamp: number
  encounterName: string
  zone: string
  duration: string
  combatants: CombatantSnapshot[]
  encounter: EncounterSnapshot
}

// ─── Raw OverlayPlugin event shapes ───────────────────────────────────────────

export interface CombatDataEvent {
  type: 'CombatData'
  isActive: 'true' | 'false'
  Encounter: Record<string, string>
  Combatant: Record<string, Record<string, string>>
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
