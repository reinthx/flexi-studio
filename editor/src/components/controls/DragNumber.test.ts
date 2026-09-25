/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import DragNumber from './DragNumber.vue'

type Wrapper = VueWrapper<InstanceType<typeof DragNumber>>

async function press(wrapper: Wrapper, x: number): Promise<void> {
  await wrapper.find('.display').trigger('mousedown', { clientX: x })
  window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: x }))
  await nextTick()
}

async function drag(wrapper: Wrapper, fromX: number, toX: number): Promise<void> {
  await wrapper.find('.display').trigger('mousedown', { clientX: fromX })
  window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: toX }))
  window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: toX }))
  await nextTick()
}

describe('DragNumber', () => {
  it('renders the value and unit', () => {
    const wrapper = mount(DragNumber, { props: { modelValue: 42, unit: 'px' } })
    expect(wrapper.find('.value').text()).toBe('42')
    expect(wrapper.find('.unit').text()).toBe('px')
  })

  it('formats fractional steps with one decimal', () => {
    const wrapper = mount(DragNumber, { props: { modelValue: 1.5, step: 0.5 } })
    expect(wrapper.find('.value').text()).toBe('1.5')
  })

  it('scrubs right to increase and left to decrease', async () => {
    const wrapper = mount(DragNumber, { props: { modelValue: 10, speed: 2, step: 1 } })
    await drag(wrapper, 100, 110)
    // dx=10, speed=2, step=1 → +5
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([15])
    await wrapper.setProps({ modelValue: 15 })
    await drag(wrapper, 100, 90)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([10])
  })

  it('snaps to step and clamps to min/max', async () => {
    const wrapper = mount(DragNumber, {
      props: { modelValue: 10, min: 0, max: 12, speed: 2, step: 1 },
    })
    // dx=3 → raw 11.5 → snapped 12 (round half up), within max
    await drag(wrapper, 100, 103)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([12])
    // dx=20 → raw 20 → clamped to max 12
    await drag(wrapper, 100, 120)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([12])
    await wrapper.setProps({ modelValue: 1 })
    // dx=-20 → raw -9 → clamped to min 0
    await drag(wrapper, 100, 80)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([0])
  })

  it('click without dragging enters edit mode', async () => {
    const wrapper = mount(DragNumber, { props: { modelValue: 10 } })
    await press(wrapper, 100)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('input.edit-input').exists()).toBe(true)
  })

  it('commits typed values on Enter and clamps them', async () => {
    const wrapper = mount(DragNumber, { props: { modelValue: 10, min: 0, max: 100 } })
    await press(wrapper, 100)
    const input = wrapper.find('input.edit-input')
    await input.setValue('250')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([100])
    expect(wrapper.find('input.edit-input').exists()).toBe(false)
  })

  it('cancels editing on Escape without emitting', async () => {
    const wrapper = mount(DragNumber, { props: { modelValue: 10 } })
    await press(wrapper, 100)
    const input = wrapper.find('input.edit-input')
    await input.setValue('999')
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('input.edit-input').exists()).toBe(false)
  })

  it('ignores unparseable input and commits on blur', async () => {
    const wrapper = mount(DragNumber, { props: { modelValue: 10 } })
    await press(wrapper, 100)
    const input = wrapper.find('input.edit-input')
    await input.setValue('abc')
    await input.trigger('keydown', { key: 'Enter' })
    // Rejected input emits nothing and still exits edit mode.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('input.edit-input').exists()).toBe(false)
    await press(wrapper, 100)
    const reopened = wrapper.find('input.edit-input')
    await reopened.setValue('33')
    await reopened.trigger('blur')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([33])
  })
})
