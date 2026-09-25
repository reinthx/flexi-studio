/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import BarSlider from './BarSlider.vue'

type Wrapper = VueWrapper<InstanceType<typeof BarSlider>>

function stubTrack(wrapper: Wrapper, left: number, width: number): void {
  const el = wrapper.find('.slider-track').element as HTMLElement
  el.getBoundingClientRect = () =>
    ({ left, width, top: 0, height: 20, right: left + width, bottom: 20, x: left, y: 0, toJSON: () => ({}) }) as DOMRect
}

describe('BarSlider', () => {
  it('positions the thumb and formats the value', () => {
    const wrapper = mount(BarSlider, { props: { modelValue: 25 } })
    expect(wrapper.find('.slider-thumb').attributes('style')).toContain('left: 25%')
    expect(wrapper.find('.slider-val').text()).toBe('25')
  })

  it('formats fractional values with two decimals', () => {
    const wrapper = mount(BarSlider, { props: { modelValue: 12.5 } })
    expect(wrapper.find('.slider-val').text()).toBe('12.50')
  })

  it('emits the clicked position on the track', async () => {
    const wrapper = mount(BarSlider, { props: { modelValue: 0 } })
    stubTrack(wrapper, 100, 200)
    await wrapper.find('.slider-track').trigger('click', { clientX: 200 })
    // ratio (200-100)/200 = 0.5 → 50
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([50])
  })

  it('snaps clicks to step and clamps to min/max', async () => {
    const wrapper = mount(BarSlider, { props: { modelValue: 0, min: 10, max: 90, step: 10 } })
    stubTrack(wrapper, 100, 200)
    // ratio 0.44 → raw 45.2 → stepped 50
    await wrapper.find('.slider-track').trigger('click', { clientX: 188 })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([50])
    // Past the edges clamps instead of overshooting
    await wrapper.find('.slider-track').trigger('click', { clientX: 0 })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([10])
    await wrapper.find('.slider-track').trigger('click', { clientX: 500 })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([90])
  })

  it('drags the thumb with window listeners and clears the dragging state', async () => {
    const wrapper = mount(BarSlider, { props: { modelValue: 20 } })
    stubTrack(wrapper, 100, 200)
    await wrapper.find('.slider-thumb').trigger('mousedown', { clientX: 140 })
    expect(wrapper.find('.slider-thumb').classes()).toContain('dragging')
    window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 160 }))
    await nextTick()
    // ratio (160-100)/200 = 0.3 → 30
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([30])
    window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 160 }))
    await nextTick()
    expect(wrapper.find('.slider-thumb').classes()).not.toContain('dragging')
  })

  it('handles a zero range without NaN', () => {
    const wrapper = mount(BarSlider, { props: { modelValue: 50, min: 50, max: 50 } })
    expect(wrapper.find('.slider-thumb').attributes('style')).toContain('left: 0%')
  })
})
