import type { DeathEvent, HitRecord, HpSample } from './configSchema'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function sanitizeMaxHp(maxHp: number | undefined): number {
  return Number.isFinite(maxHp) && (maxHp ?? 0) > 0 ? Math.round(maxHp as number) : 1
}

function toFraction(currentHp: number, maxHp: number): number {
  return clamp(maxHp > 0 ? currentHp / maxHp : 0, 0, 1)
}

function applyHit(type: 'dmg' | 'heal', hpBefore: number, amount: number, maxHp: number): number {
  return clamp(type === 'heal' ? hpBefore + amount : hpBefore - amount, 0, maxHp)
}

function reverseHit(type: 'dmg' | 'heal', hpAfter: number, amount: number, maxHp: number): number {
  return clamp(type === 'heal' ? hpAfter - amount : hpAfter + amount, 0, maxHp)
}

function findNearestSample(samples: HpSample[], t: number): HpSample | null {
  let best: HpSample | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const sample of samples) {
    const distance = Math.abs((sample.t ?? 0) - t)
    if (distance < bestDistance) {
      best = sample
      bestDistance = distance
    }
  }
  return best
}

function findNearestSampleAtOrBefore(samples: HpSample[], t: number): HpSample | null {
  let best: HpSample | null = null
  for (const sample of samples) {
    if ((sample.t ?? 0) <= t) best = sample
    else break
  }
  return best
}

export function buildDeathEvents(
  hpSamples: HpSample[] | undefined,
  hits: HitRecord[] | undefined,
  deathTimestamp: number,
): DeathEvent[] {
  const sortedSamples = [...(hpSamples ?? [])]
    .filter(sample => sample && Number.isFinite(sample.currentHp) && Number.isFinite(sample.maxHp) && sample.maxHp > 0)
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
  const sortedHits = [...(hits ?? [])].sort((a, b) => (a.t ?? 0) - (b.t ?? 0))

  if (sortedHits.length === 0) return []

  const events: DeathEvent[] = []
  let runningAfterRaw: number | null = null
  let runningMaxHp = sanitizeMaxHp(sortedSamples[sortedSamples.length - 1]?.maxHp)

  for (const hit of sortedHits) {
    const sampleBefore = findNearestSampleAtOrBefore(sortedSamples, hit.t ?? 0)
    const nearestSample = sampleBefore ?? findNearestSample(sortedSamples, hit.t ?? 0)
    const maxHp = sanitizeMaxHp(hit.maxHp ?? sampleBefore?.maxHp ?? nearestSample?.maxHp ?? runningMaxHp)
    let isEstimated = false

    if (hit.abilityName === 'Death') {
      const hpBeforeRaw = clamp(
        runningAfterRaw
          ?? sampleBefore?.currentHp
          ?? nearestSample?.currentHp
          ?? 0,
        0,
        maxHp,
      )
      if (runningAfterRaw === null && !sampleBefore && !nearestSample) isEstimated = true
      events.push({
        t: hit.t ?? deathTimestamp,
        type: 'death',
        abilityName: 'Death',
        sourceName: hit.sourceName || '---',
        amount: 0,
        hpBefore: toFraction(hpBeforeRaw, maxHp),
        hpAfter: 0,
        hpBeforeRaw,
        hpAfterRaw: 0,
        maxHp,
        isDeathBlow: true,
        isEstimated,
      })
      runningAfterRaw = 0
      runningMaxHp = maxHp
      continue
    }

    let hpAfterRaw: number | null = Number.isFinite(hit.currentHp) ? clamp(hit.currentHp ?? 0, 0, maxHp) : null
    if (hpAfterRaw === null && sampleBefore && Math.abs((sampleBefore.t ?? 0) - (hit.t ?? 0)) <= 1500) {
      hpAfterRaw = clamp(sampleBefore.currentHp, 0, maxHp)
      isEstimated = true
    }
    if (hpAfterRaw === null && nearestSample && Math.abs((nearestSample.t ?? 0) - (hit.t ?? 0)) <= 1500) {
      hpAfterRaw = clamp(nearestSample.currentHp, 0, maxHp)
      isEstimated = true
    }

    let hpBeforeRaw: number | null = null
    if (hpAfterRaw !== null) {
      hpBeforeRaw = reverseHit(hit.type, hpAfterRaw, hit.amount ?? 0, maxHp)
      if (
        (hit.type === 'dmg' && hpBeforeRaw === hpAfterRaw && (hit.amount ?? 0) > 0) ||
        (hit.type === 'heal' && hpBeforeRaw === hpAfterRaw && (hit.amount ?? 0) > 0)
      ) {
        isEstimated = true
      }
    } else if (runningAfterRaw !== null) {
      hpBeforeRaw = clamp(runningAfterRaw, 0, maxHp)
      hpAfterRaw = applyHit(hit.type, hpBeforeRaw, hit.amount ?? 0, maxHp)
      isEstimated = true
    } else if (sampleBefore) {
      hpAfterRaw = clamp(sampleBefore.currentHp, 0, maxHp)
      hpBeforeRaw = reverseHit(hit.type, hpAfterRaw, hit.amount ?? 0, maxHp)
      isEstimated = true
    } else if (nearestSample) {
      hpAfterRaw = clamp(nearestSample.currentHp, 0, maxHp)
      hpBeforeRaw = reverseHit(hit.type, hpAfterRaw, hit.amount ?? 0, maxHp)
      isEstimated = true
    }

    if (hpBeforeRaw === null || hpAfterRaw === null) {
      hpBeforeRaw = clamp(runningAfterRaw ?? 0, 0, maxHp)
      hpAfterRaw = applyHit(hit.type, hpBeforeRaw, hit.amount ?? 0, maxHp)
      isEstimated = true
    }

    events.push({
      t: hit.t ?? deathTimestamp,
      type: hit.type,
      abilityName: hit.abilityName,
      sourceName: hit.sourceName,
      amount: hit.amount ?? 0,
      hpBefore: toFraction(hpBeforeRaw, maxHp),
      hpAfter: toFraction(hpAfterRaw, maxHp),
      hpBeforeRaw,
      hpAfterRaw,
      maxHp,
      isDeathBlow: false,
      isEstimated,
    })

    runningAfterRaw = hpAfterRaw
    runningMaxHp = maxHp
  }

  const lastEvent = events[events.length - 1]
  if (!lastEvent || !lastEvent.isDeathBlow) {
    const maxHp = sanitizeMaxHp(lastEvent?.maxHp ?? sortedSamples[sortedSamples.length - 1]?.maxHp ?? runningMaxHp)
    const hpBeforeRaw = clamp(lastEvent?.hpAfterRaw ?? runningAfterRaw ?? 0, 0, maxHp)
    events.push({
      t: deathTimestamp,
      type: 'death',
      abilityName: 'Death',
      sourceName: '---',
      amount: 0,
      hpBefore: toFraction(hpBeforeRaw, maxHp),
      hpAfter: 0,
      hpBeforeRaw,
      hpAfterRaw: 0,
      maxHp,
      isDeathBlow: true,
      isEstimated: true,
    })
  }

  return events
}
