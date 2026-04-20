import type { BarFill, BorderRadius, BarOutline, BarShape, CornerCuts, EdgeType, GradientFill, TextureFill } from '@shared/configSchema'

const ANIMATION_SPEED_MAP: Record<number, string> = {
  1: '10s', 2: '8s', 3: '6s', 4: '5s', 5: '4s',
  6: '3s', 7: '2.5s', 8: '2s', 9: '1.5s', 10: '1s'
}

const GRADIENT_ANIMATION_KEYFRAMES = `
@keyframes gradientAngleSpin {
  from { --gradient-angle: 0deg; }
  to { --gradient-angle: 360deg; }
}
@keyframes gradientAngleOscillate {
  0% { --gradient-angle: 0deg; }
  50% { --gradient-angle: 360deg; }
  100% { --gradient-angle: 0deg; }
}
@keyframes gradientScrollX {
  0% { background-position: 0% 0%; }
  100% { background-position: 200% 0%; }
}
@keyframes gradientScrollY {
  0% { background-position: 0% 0%; }
  100% { background-position: 0% 200%; }
}
@keyframes shimmerMove {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`

let keyframesInjected = false

export function injectGradientAnimations(): void {
  if (keyframesInjected) return
  keyframesInjected = true
  
  const fullCss = `
    ${GRADIENT_ANIMATION_KEYFRAMES}
    .animated-fill {
      animation-fill-mode: backwards;
      animation-timing-function: linear;
    }
  `
  const style = document.createElement('style')
  style.id = 'gradient-animations'
  style.textContent = fullCss
  document.head.appendChild(style)
}

/**
 * Builds a CSS filter string for drop-shadow with optional thickness emulation.
 * CSS filter drop-shadow() has no spread/thickness parameter, so we approximate it by
 * adding thickness to the blur radius — slightly softer but avoids cascade explosion.
 */
export function buildDropShadowFilter(offsetX: number, offsetY: number, blur: number, color: string, thickness = 0): string {
  // CSS filter drop-shadow() has no spread parameter, and chaining multiple drop-shadow()
  // calls creates a cascade (each shadows the previous shadows too), causing exponential bleed.
  // Approximation: add positive thickness to the blur radius — produces a larger, slightly softer
  // shadow that closely matches the intent without any cascade side effects.
  const effectiveBlur = blur + Math.max(0, thickness)
  return `drop-shadow(${offsetX}px ${offsetY}px ${effectiveBlur}px ${color})`
}

export function buildFillCss(fill: BarFill, barIndex: number = 0, barHeightWithGap: number = 30): Record<string, any> {
  switch (fill.type) {
    case 'solid':
      return fill.opacity !== undefined && fill.opacity < 1
        ? { backgroundColor: fill.color, opacity: String(fill.opacity) }
        : { backgroundColor: fill.color }

    case 'gradient': {
      const { gradient } = fill
      const stops = gradient.stops
        .map(s => `${s.color} ${(s.position * 100).toFixed(1)}%`)
        .join(', ')
      const anim = gradient.animation
      const hasAnimation = anim?.enabled === true
      const angle = gradient.angle ?? 90
      
      // For angle rotation: use CSS custom property so keyframes can animate it
      // For scroll/shimmer: use fixed angle
      const needsAngleAnim = hasAnimation && anim.angleRotation !== 'none'
      const angleValue = needsAngleAnim ? 'var(--gradient-angle, ' + angle + 'deg)' : angle + 'deg'
      
      const gradientCss = gradient.type === 'linear'
        ? `linear-gradient(${angleValue}, ${stops})`
        : `radial-gradient(circle, ${stops})`
      
      const result: Record<string, string> = {
        backgroundImage: gradientCss,
      }
      
      if (fill.opacity !== undefined && fill.opacity < 1) {
        result.opacity = String(fill.opacity)
      }
      if (hasAnimation) {
        const animCss = buildGradientAnimationCss(gradient)
        
        // Set CSS var for keyframes to animate
        if (anim.angleRotation !== 'none') {
          result['--gradient-angle'] = angle + 'deg'
        }
        // Scroll: make background larger and animate position to shift gradient
        if (anim.scrollDirection !== 'none') {
          result.backgroundSize = '400% 100%'
          result.backgroundRepeat = 'no-repeat'
        }
        if (anim.shimmerEnabled) {
          result.backgroundSize = '400% 100%'
        }
        
        Object.assign(result, animCss)
      }
      return result
    }

    case 'texture': {
      const { texture } = fill
      const isStretch = texture.repeat === 'stretch'
      const isPaginate = texture.repeat === 'paginate'
      // For paginate, use original size. For stretch, stretch to fill. For others, auto.
      const size = isPaginate ? 'auto' : (isStretch ? '100% 100%' : 'auto')
      const repeat = (texture.repeat === 'no-repeat' || isPaginate) ? 'no-repeat' : 'repeat'
      const result: Record<string, string> = {
        backgroundImage: `url('${texture.src}')`,
        backgroundSize: size,
        backgroundRepeat: repeat,
        backgroundPosition: '0 0',
        opacity: String(texture.opacity),
        mixBlendMode: texture.blendMode,
      }
      if (texture.tintGradient) {
        const tg = texture.tintGradient
        const tgStops = tg.stops.map(s => `${s.color} ${(s.position * 100).toFixed(1)}%`).join(', ')
        const tgCss = tg.type === 'linear'
          ? `linear-gradient(${tg.angle ?? 90}deg, ${tgStops})`
          : `radial-gradient(circle, ${tgStops})`
        result.backgroundImage = `${tgCss}, url('${texture.src}')`
        result.backgroundSize = `100% 100%, ${size}`
        result.backgroundRepeat = `no-repeat, ${repeat}`
        result.backgroundPosition = `0 0, 0 0`
        result.backgroundBlendMode = 'multiply, normal'
      } else if (texture.tintColor) {
        result.backgroundColor = texture.tintColor
        result.backgroundBlendMode = 'multiply'
      }
      if (texture.pagination?.enabled) {
        const paginationCss = buildTexturePaginationCss(texture, barIndex, barHeightWithGap)
        if (texture.tintGradient) {
          result.backgroundPosition = `0 0, ${paginationCss.backgroundPosition}`
          result.backgroundSize = `100% 100%, ${paginationCss.backgroundSize}`
        } else {
          Object.assign(result, paginationCss)
        }
      }
      return result
    }
  }
}

export function buildGradientAnimationCss(gradient: GradientFill): Record<string, any> {
  const anim = gradient.animation!
  if (!anim || anim.enabled === false) return {}

  const animations: string[] = []
  const customProps: Record<string, string> = {}

  if (anim.angleRotation !== 'none') {
    const duration = ANIMATION_SPEED_MAP[anim.angleRotationSpeed] ?? '4s'
    const direction = anim.angleRotationDirection === 'clockwise' ? 'normal' : 'reverse'
    const timing = anim.angleRotation === 'continuous' ? 'linear' : 'ease-in-out'
    animations.push(`gradientAngle${anim.angleRotation === 'continuous' ? 'Spin' : 'Oscillate'} ${duration} ${timing} ${direction} infinite`)
  }

  if (anim.scrollDirection !== 'none') {
    const duration = ANIMATION_SPEED_MAP[anim.scrollSpeed] ?? '4s'
    const isHorizontal = anim.scrollDirection.includes('to-left') || anim.scrollDirection.includes('to-right')
    animations.push(`gradientScroll${isHorizontal ? 'X' : 'Y'} ${duration} linear infinite`)
  }

  if (anim.shimmerEnabled) {
    const duration = ANIMATION_SPEED_MAP[anim.shimmerSpeed] ?? '4s'
    customProps['--shimmer-width'] = `${anim.shimmerWidth ?? 30}%`
    animations.push(`shimmerMove ${duration} linear infinite`)
  }

  const result: Record<string, string> = {}
  if (animations.length > 0) {
    result.animation = animations.join(', ')
  }
  for (const [key, val] of Object.entries(customProps)) {
    result[key] = val
  }

  return result
}

export function buildTexturePaginationCss(texture: TextureFill, barIndex: number = 0, barHeightWithGap: number = 30): Record<string, any> {
  const pag = texture.pagination
  if (!pag?.enabled) return {}

  const startOffsetX = pag.startOffsetX ?? 0
  const startOffsetY = pag.startOffsetY ?? 0
  const offsetY = startOffsetY + (barIndex * barHeightWithGap)

  return {
    backgroundPosition: `${startOffsetX}px -${offsetY}px`,
    backgroundSize: 'auto'
  }
}

export function buildBorderRadiusCss(r: BorderRadius | undefined): string {
  if (!r) return '0'
  return `${r.tl}px ${r.tr}px ${r.br}px ${r.bl}px`
}

/**
 * Builds a clip-path polygon from independent left/right edge types.
 *
 * Polygon constructed clockwise: TL → (top) → TR → BR → (bottom) → BL → (left back up to TL)
 *
 * Left edge (d = edgeDepth):
 *   flat    → TL=(0,0%),       BL=(0,100%),      no mid
 *   point   → TL=(d,0%),       BL=(d,100%),      mid=(0,50%)  [point goes LEFT off the bar]
 *   slant-a → TL=(d,0%),       BL=(0,100%),      no mid  [top shifts right: / lean]
 *   slant-b → TL=(0,0%),       BL=(d,100%),      no mid  [bottom shifts right: \ lean]
 *
 * Right edge (mirrored):
 *   flat    → TR=(100%,0%),    BR=(100%,100%),   no mid
 *   point   → TR=(100%-d,0%),  BR=(100%-d,100%), mid=(100%,50%) [point goes RIGHT]
 *   slant-a → TR=(100%,0%),    BR=(100%-d,100%), no mid  [bottom shifts left: \ lean]
 *   slant-b → TR=(100%-d,0%),  BR=(100%,100%),   no mid  [top shifts left: / lean]
 */
export function buildEdgeClipPath(leftEdge: EdgeType, rightEdge: EdgeType, leftDepth: number, rightDepth: number): string {
  const leftD = leftEdge === 'flat' ? 0 : Math.max(0, leftDepth)
  const rightD = rightEdge === 'flat' ? 0 : Math.max(0, rightDepth)

  // Clamp each side proportionally so edges can't cross when combined depth > bar width.
  // With independent 50% caps, a 19px/39px split becomes 50%/50% — losing the angle ratio.
  // Proportional: 19/(19+39)=32.8% and 39/(19+39)=67.2% — preserves the configured steepness.
  const total = leftD + rightD
  const leftMaxPct = total > 0 ? (leftD / total * 100).toFixed(1) : '50'
  const rightMinPct = leftMaxPct // right side can't go further left than where left side stops
  const ld = (px: number) => `min(${px}px, ${leftMaxPct}%)`
  const rd = (px: number) => `max(calc(100% - ${px}px), ${rightMinPct}%)`

  // Left side points (TL and BL)
  let tlX: string, blX: string, leftMid: string | null = null
  switch (leftEdge) {
    case 'point':   tlX = ld(leftD); blX = ld(leftD); leftMid = `0% 50%`; break
    case 'slant-a': tlX = ld(leftD); blX = `0%`;      break
    case 'slant-b': tlX = `0%`;      blX = ld(leftD); break
    default:        tlX = `0%`;      blX = `0%`;      break  // flat
  }

  // Right side points (TR and BR)
  let trX: string, brX: string, rightMid: string | null = null
  switch (rightEdge) {
    case 'point':   trX = rd(rightD); brX = rd(rightD); rightMid = `100% 50%`; break
    case 'slant-a': trX = `100%`;     brX = rd(rightD); break
    case 'slant-b': trX = rd(rightD); brX = `100%`;     break
    default:        trX = `100%`;     brX = `100%`;     break  // flat
  }

  const pts: string[] = []
  pts.push(`${tlX} 0%`)     // TL
  pts.push(`${trX} 0%`)     // TR (top edge end)
  if (rightMid) pts.push(rightMid)  // right chevron midpoint
  pts.push(`${brX} 100%`)   // BR
  pts.push(`${blX} 100%`)   // BL (bottom edge end)
  if (leftMid) pts.push(leftMid)    // left chevron midpoint (going back up)

  return `polygon(${pts.join(', ')})`
}

/**
 * Variable-point clip-path polygon for chamfer (corner cuts).
 * A corner is only cut when BOTH x AND y are > 0.
 */
export function buildCornerCutCss(cuts: CornerCuts, chamferMode: 'none'|'left'|'right'|'both' = 'none'): string {
  const filtered: CornerCuts = { tl: {x:0,y:0}, tr: {x:0,y:0}, br: {x:0,y:0}, bl: {x:0,y:0} }
  if (chamferMode === 'left' || chamferMode === 'both') {
    filtered.tl = cuts.tl
    filtered.bl = cuts.bl
  }
  if (chamferMode === 'right' || chamferMode === 'both') {
    filtered.tr = cuts.tr
    filtered.br = cuts.br
  }

  const { tl, tr, br, bl } = filtered
  const pts: string[] = []

  if (tl.x > 0 && tl.y > 0) pts.push(`${tl.x}px 0`)
  else pts.push(`0 0`)

  if (tr.x > 0 && tr.y > 0) pts.push(`calc(100% - ${tr.x}px) 0`, `100% ${tr.y}px`)
  else pts.push(`100% 0`)

  if (br.x > 0 && br.y > 0) pts.push(`100% calc(100% - ${br.y}px)`, `calc(100% - ${br.x}px) 100%`)
  else pts.push(`100% 100%`)

  if (bl.x > 0 && bl.y > 0) pts.push(`${bl.x}px 100%`, `0 calc(100% - ${bl.y}px)`)
  else pts.push(`0 100%`)

  if (tl.x > 0 && tl.y > 0) pts.push(`0 ${tl.y}px`)

  return `polygon(${pts.join(', ')})`
}


/**
 * Returns the shape CSS for a bar.
 *
 * Priority:
 *  1. Chamfer (if chamferMode not 'none') — clip-path polygon
 *  2. Edge types not both flat — clip-path from buildEdgeClipPath
 *  3. Both edges flat — border-radius
 *
 * IMPORTANT: apply clip-path only to the bg+fill inner div.
 * The label layer should be a sibling (no clip-path) so text is never cut off.
 */
export function buildShapeCss(shape: BarShape): Record<string, any> {
  const result: Record<string, string> = {}

  const chamferMode = shape.chamferMode ?? 'none'

  if (chamferMode !== 'none') {
    const cuts = shape.cornerCuts ?? { tl: {x:0,y:0}, tr: {x:0,y:0}, br: {x:0,y:0}, bl: {x:0,y:0} }
    const hasCuts = (chamferMode === 'left' || chamferMode === 'both')
      ? (cuts.tl.x > 0 && cuts.tl.y > 0) || (cuts.bl.x > 0 && cuts.bl.y > 0)
      : false
    const hasCutsRight = (chamferMode === 'right' || chamferMode === 'both')
      ? (cuts.tr.x > 0 && cuts.tr.y > 0) || (cuts.br.x > 0 && cuts.br.y > 0)
      : false

    if (hasCuts || hasCutsRight) {
      result.clipPath = buildCornerCutCss(cuts, chamferMode)
      result.borderRadius = buildBorderRadiusCss(shape.borderRadius)
      return result
    }
  }

  const left  = shape.leftEdge  ?? 'flat'
  const right = shape.rightEdge ?? 'flat'
  const leftDepth = shape.edgeDepthLeft ?? shape.edgeDepth ?? 10
  const rightDepth = shape.edgeDepthRight ?? shape.edgeDepth ?? 10

  if (left !== 'flat' || right !== 'flat') {
    result.clipPath = buildEdgeClipPath(left, right, leftDepth, rightDepth)
  }
  // Always return borderRadius
  result.borderRadius = buildBorderRadiusCss(shape.borderRadius)

  return result
}

export function buildOutlineCss(outline: BarOutline): Record<string, any> {
  const { color, thickness: t } = outline
  const shadows: string[] = []
  if (t.top    > 0) shadows.push(`inset 0 ${t.top}px 0 ${color}`)
  if (t.bottom > 0) shadows.push(`inset 0 -${t.bottom}px 0 ${color}`)
  if (t.left   > 0) shadows.push(`inset ${t.left}px 0 0 ${color}`)
  if (t.right  > 0) shadows.push(`inset -${t.right}px 0 0 ${color}`)
  return shadows.length ? { boxShadow: shadows.join(', ') } : {}
}
