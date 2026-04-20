import type { BarShape, Orientation } from './configSchema'

export type ShapePoint = [number, number]

export function clampDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function isActiveCut(cut: { x: number; y: number } | undefined): boolean {
  return !!cut && cut.x > 0 && cut.y > 0
}

export function isNonRectShape(shape: BarShape | undefined): boolean {
  if (!shape) return false
  const chamferMode = shape.chamferMode ?? 'none'
  if (chamferMode !== 'none') {
    const cuts = shape.cornerCuts
    const includeLeft = chamferMode === 'left' || chamferMode === 'both'
    const includeRight = chamferMode === 'right' || chamferMode === 'both'
    return (includeLeft && (isActiveCut(cuts?.tl) || isActiveCut(cuts?.bl)))
      || (includeRight && (isActiveCut(cuts?.tr) || isActiveCut(cuts?.br)))
  }
  return (shape.leftEdge ?? 'flat') !== 'flat' || (shape.rightEdge ?? 'flat') !== 'flat'
}

export function buildShapePoints(shape: BarShape | undefined, width: number, height: number): ShapePoint[] {
  const w = clampDimension(width, 100)
  const h = clampDimension(height, 28)
  if (!shape) return [[0, 0], [w, 0], [w, h], [0, h]]

  const chamferMode = shape.chamferMode ?? 'none'
  if (chamferMode !== 'none') {
    const cuts = shape.cornerCuts
    const includeLeft = chamferMode === 'left' || chamferMode === 'both'
    const includeRight = chamferMode === 'right' || chamferMode === 'both'
    const tl = includeLeft ? cuts?.tl : undefined
    const tr = includeRight ? cuts?.tr : undefined
    const br = includeRight ? cuts?.br : undefined
    const bl = includeLeft ? cuts?.bl : undefined
    const pts: ShapePoint[] = []

    if (isActiveCut(tl)) pts.push([Math.min(tl!.x, w), 0])
    else pts.push([0, 0])

    if (isActiveCut(tr)) pts.push([Math.max(0, w - tr!.x), 0], [w, Math.min(tr!.y, h)])
    else pts.push([w, 0])

    if (isActiveCut(br)) pts.push([w, Math.max(0, h - br!.y)], [Math.max(0, w - br!.x), h])
    else pts.push([w, h])

    if (isActiveCut(bl)) pts.push([Math.min(bl!.x, w), h], [0, Math.max(0, h - bl!.y)])
    else pts.push([0, h])

    if (isActiveCut(tl)) pts.push([0, Math.min(tl!.y, h)])
    return dedupeAdjacentPoints(pts)
  }

  const left = shape.leftEdge ?? 'flat'
  const right = shape.rightEdge ?? 'flat'
  const rawLeftDepth = left === 'flat' ? 0 : Math.max(0, shape.edgeDepthLeft ?? shape.edgeDepth ?? 10)
  const rawRightDepth = right === 'flat' ? 0 : Math.max(0, shape.edgeDepthRight ?? shape.edgeDepth ?? 10)
  const totalDepth = rawLeftDepth + rawRightDepth
  const scale = totalDepth > w && totalDepth > 0 ? w / totalDepth : 1
  const leftDepth = rawLeftDepth * scale
  const rightDepth = rawRightDepth * scale

  let tlX = 0
  let blX = 0
  let leftMid: ShapePoint | undefined
  switch (left) {
    case 'point': tlX = leftDepth; blX = leftDepth; leftMid = [0, h / 2]; break
    case 'slant-a': tlX = leftDepth; blX = 0; break
    case 'slant-b': tlX = 0; blX = leftDepth; break
  }

  let trX = w
  let brX = w
  let rightMid: ShapePoint | undefined
  switch (right) {
    case 'point': trX = w - rightDepth; brX = w - rightDepth; rightMid = [w, h / 2]; break
    case 'slant-a': trX = w; brX = w - rightDepth; break
    case 'slant-b': trX = w - rightDepth; brX = w; break
  }

  const pts: ShapePoint[] = [[tlX, 0], [trX, 0]]
  if (rightMid) pts.push(rightMid)
  pts.push([brX, h], [blX, h])
  if (leftMid) pts.push(leftMid)
  return dedupeAdjacentPoints(pts)
}

export function pointsToString(points: ShapePoint[]): string {
  return points.map(([x, y]) => `${roundPoint(x)},${roundPoint(y)}`).join(' ')
}

export function pointsToCssPolygon(points: ShapePoint[]): string {
  return points.map(([x, y]) => `${roundPoint(x)}px ${roundPoint(y)}px`).join(', ')
}

export function buildFillClipPoints(points: ShapePoint[], width: number, height: number, fraction: number, orientation: Orientation): ShapePoint[] {
  const frac = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  if (frac <= 0) return []
  if (frac >= 1) return points
  if (orientation === 'horizontal') {
    return clipPolygonY(points, clampDimension(height, 28) * (1 - frac), true)
  }
  return clipPolygonX(points, clampDimension(width, 100) * frac, true)
}

export function hasUsablePolygon(points: ShapePoint[]): boolean {
  return points.length >= 3 && Math.abs(polygonArea(points)) > 0.001
}

export function polygonArea(points: ShapePoint[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    area += x1 * y2 - x2 * y1
  }
  return area / 2
}

export function clipPolygonX(points: ShapePoint[], xLimit: number, keepLessOrEqual: boolean): ShapePoint[] {
  return clipPolygon(points, ([x]) => keepLessOrEqual ? x <= xLimit : x >= xLimit, (a, b) => {
    const dx = b[0] - a[0]
    const t = dx === 0 ? 0 : (xLimit - a[0]) / dx
    return [xLimit, a[1] + (b[1] - a[1]) * t]
  })
}

export function clipPolygonY(points: ShapePoint[], yLimit: number, keepGreaterOrEqual: boolean): ShapePoint[] {
  return clipPolygon(points, ([, y]) => keepGreaterOrEqual ? y >= yLimit : y <= yLimit, (a, b) => {
    const dy = b[1] - a[1]
    const t = dy === 0 ? 0 : (yLimit - a[1]) / dy
    return [a[0] + (b[0] - a[0]) * t, yLimit]
  })
}

function clipPolygon(points: ShapePoint[], isInside: (p: ShapePoint) => boolean, intersect: (a: ShapePoint, b: ShapePoint) => ShapePoint): ShapePoint[] {
  const result: ShapePoint[] = []
  for (let i = 0; i < points.length; i++) {
    const current = points[i]
    const previous = points[(i + points.length - 1) % points.length]
    const currentInside = isInside(current)
    const previousInside = isInside(previous)
    if (currentInside !== previousInside) result.push(intersect(previous, current))
    if (currentInside) result.push(current)
  }
  return dedupeAdjacentPoints(result)
}

function dedupeAdjacentPoints(points: ShapePoint[]): ShapePoint[] {
  return points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length]
    return Math.abs(point[0] - previous[0]) > 0.001 || Math.abs(point[1] - previous[1]) > 0.001
  })
}

function roundPoint(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, '')
}
