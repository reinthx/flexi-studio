import { describe, expect, it } from 'vitest'
import { buildMetricFractions, createMetricFractionContext, getMetricValue, parseMetricNumber } from '../metricFractions'

describe('metricFractions', () => {
  const combatants = [
    {
      name: 'Alpha',
      encdps: '100',
      enchps: '40',
      damagetaken: '500',
      DURATION: '10',
      rdps: '120',
      'damage%': '25',
      'healed%': '10',
      'crithit%': '33',
      'threat%': '75',
    },
    {
      name: 'Bravo',
      encdps: '200',
      enchps: '20',
      damagetaken: '250',
      DURATION: '5',
      rdps: '60',
      'damage%': '50',
      'healed%': '5',
      'crithit%': '66',
      'threat%': '25',
    },
  ]

  it('parses invalid metric values as zero', () => {
    expect(parseMetricNumber(undefined)).toBe(0)
    expect(parseMetricNumber('not-a-number')).toBe(0)
    expect(parseMetricNumber('12.5')).toBe(12.5)
  })

  it('derives dtps and threat aliases', () => {
    expect(getMetricValue({ damagetaken: '120', DURATION: '4' }, 'dtps')).toBe(30)
    expect(getMetricValue({ threat: '12' }, 'threat')).toBe(12)
    expect(getMetricValue({ Threat: '34' }, 'threat')).toBe(34)
    expect(getMetricValue({ 'Threat%': '56' }, 'threat')).toBe(56)
  })

  it('normalizes max-based and percent-based metrics', () => {
    const context = createMetricFractionContext(combatants)

    expect(buildMetricFractions(context, combatants[0])).toMatchObject({
      encdps: 0.5,
      enchps: 1,
      dtps: 1,
      rdps: 1,
      'damage%': 0.25,
      'healed%': 0.1,
      'crithit%': 0.33,
      threat: 0.75,
    })
  })

  it('uses max-based threat when ACT only provides raw threat', () => {
    const context = createMetricFractionContext([{ threat: '25' }, { threat: '100' }])

    expect(buildMetricFractions(context, { threat: '25' }).threat).toBe(0.25)
  })

  it('clamps fractions to the 0..1 range', () => {
    const context = createMetricFractionContext([{ encdps: '100' }])

    expect(buildMetricFractions(context, { encdps: '250', 'damage%': '140' }).encdps).toBe(1)
    expect(buildMetricFractions(context, { encdps: '-10', 'damage%': '-5' })['damage%']).toBe(0)
  })
})
