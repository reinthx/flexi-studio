import { expect, it } from 'vitest'
import {
  buildOverviewTimelineBars,
  buildPullGroupDpsBars,
  buildRdpsTimeline,
  buildTimelineChartModel,
  buildTimelineDeathMarkers,
  buildTimelineHoverTooltip,
  buildTimelineInspectorRows,
  buildTimelineRaidBuffWindows,
  buildTimelineRaiseMarkers,
  castsInTimelineWindow,
  deathClusters,
  deathsInTimelineWindow,
  GROUP_NAME,
  timelineWindowForBucket,
  topTimelineSpikes,
} from '../timelineSummary'

const fmtTime = (ms: number) => `${ms / 1000}s`
const fmt = (value: number) => value.toFixed(0)

it('builds timeline bars and top spikes from bucket totals', () => {
  expect(topTimelineSpikes([3, 30, 6]).map(item => item.index)).toEqual([1, 2, 0])
  const bars = buildOverviewTimelineBars([3, 6, 9], fmtTime, fmt)
  expect(bars).toHaveLength(3)
  expect(bars[0]).toMatchObject({ key: 'overview-timeline-0', label: '0s', value: '1' })
  expect(bars[2].height).toBe('100.0%')
})

it('groups pull dps bars with death and raise counts', () => {
  const bars = buildPullGroupDpsBars({ A: [3, 6], B: [9, 12] }, ['A', 'B'], [
    { targetName: 'A', targetId: '1', timestamp: 0, hpSamples: [] },
    { targetName: 'B', targetId: '2', timestamp: 4000, resurrectTime: 5000, hpSamples: [] },
  ], fmtTime)
  expect(bars.map(bar => [bar.value, bar.deathCount, bar.raiseCount])).toEqual([[4, 1, 0], [6, 1, 1]])
})

it('builds timeline chart series with focus, smoothing, and group totals', () => {
  const chart = buildTimelineChartModel({ B: [0, 12, 24], A: [3, 6, 9], Enemy: [90, 90, 90] }, {
    showEnemies: false,
    isEnemy: name => name === 'Enemy',
    selected: 'B',
    hiddenSeries: new Set(),
    formatValue: value => value.toFixed(0),
    geometry: { pl: 10, pt: 5, cw: 100, ch: 50 },
  })

  expect(chart?.series.map(series => series.name)).toEqual(['B', 'A', GROUP_NAME])
  expect(chart?.series[0]).toMatchObject({ name: 'B', isFocused: true })
  expect(chart?.series[2].values).toEqual([1, 3.5, 6])
  expect(chart?.yTicks.at(-1)?.label).toBe('6')
  expect(chart?.points([0, 6])).toBe('10.0,55.0 60.0,5.0')
})

it('builds rDPS timeline scaling and timeline inspector rows', () => {
  expect(buildRdpsTimeline({ Alice: [10, 30], Bob: [0, 0] }, { Alice: 20, Bob: 5 }, 10)).toEqual({
    Alice: [50, 150],
    Bob: [0, 0],
  })
  expect(buildTimelineInspectorRows({
    metricLabel: 'rDPS',
    hoverTimeLabel: '0:30',
    deathCount: 2,
    castCount: 3,
    chartMetric: 'rdps',
    selectedName: 'Alice',
    rdpsGivenFor: () => 100,
    rdpsTakenFor: () => 50,
    formatValue: value => `${value}`,
  })).toEqual([
    ['Metric', 'rDPS'],
    ['DPS Given', '100'],
    ['DPS Taken', '50'],
    ['Hover Window', '0:30'],
    ['Deaths', '2'],
    ['Casts', '3'],
  ])
})

it('builds timeline markers and hover tooltip context', () => {
  const deaths = [
    { targetName: 'Alice', targetId: '10A', timestamp: 3000, resurrectTime: 5000, resurrectSourceName: 'Bob', hpSamples: [] },
  ]
  const buffWindows = buildTimelineRaidBuffWindows({
    Bob: [{ t: 2000, abilityId: '1', abilityName: 'Battle Litany', source: 'Bob', target: 'Alice', type: 'instant', buffDurationMs: 15000 }],
  })
  const deathMarkers = buildTimelineDeathMarkers(deaths, fmtTime)
  const raiseMarkers = buildTimelineRaiseMarkers(deaths, fmtTime)
  const chart = buildTimelineChartModel({ Alice: [3, 6], Bob: [9, 12] }, {
    showEnemies: true,
    isEnemy: () => false,
    selected: 'Alice',
    hiddenSeries: new Set(),
    formatValue: value => value.toFixed(0),
    geometry: { pl: 10, pt: 5, cw: 100, ch: 50 },
  })
  const tooltip = buildTimelineHoverTooltip(chart, 1, new Set(), buffWindows, deathMarkers, raiseMarkers, () => 0, () => 0)

  expect(buffWindows[0]).toMatchObject({ source: 'Bob', target: 'Alice', name: 'Battle Litany', start: 2, end: 17 })
  expect(deathMarkers[0].label).toBe('Alice died at 3s')
  expect(raiseMarkers[0].label).toBe('Alice Raised by Bob at 5s')
  expect(tooltip).toMatchObject({ timeLabel: '0:03', activeBuffs: buffWindows, deaths: deathMarkers, raises: raiseMarkers })
  expect(tooltip?.entries.map(entry => entry.name)).toEqual(['Bob', 'Alice'])
})

it('filters casts and deaths inside timeline windows', () => {
  const window = timelineWindowForBucket(1)
  expect(window).toEqual({ start: 3000, end: 6000 })
  expect(castsInTimelineWindow([
    { t: 2500, abilityId: '1', abilityName: 'Early', source: 'A', target: 'B', type: 'instant' },
    { t: 3000, abilityId: '2', abilityName: 'Inside', source: 'A', target: 'B', type: 'instant' },
    { t: 6000, abilityId: '3', abilityName: 'Late', source: 'A', target: 'B', type: 'instant' },
  ], window)).toHaveLength(1)
  expect(deathsInTimelineWindow([
    { targetName: 'A', targetId: '1', timestamp: 3000, hpSamples: [] },
    { targetName: 'B', targetId: '2', timestamp: 6000, hpSamples: [] },
  ], window).map(death => death.targetName)).toEqual(['A'])
})

it('clusters deaths within fifteen seconds', () => {
  expect(deathClusters([
    { targetName: 'A', targetId: '1', timestamp: 1000, hpSamples: [] },
    { targetName: 'B', targetId: '2', timestamp: 12000, hpSamples: [] },
    { targetName: 'C', targetId: '3', timestamp: 40000, hpSamples: [] },
  ])).toEqual([{ start: 1000, end: 12000, count: 2 }])
})
