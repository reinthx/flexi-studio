/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ColorPicker from './ColorPicker.vue'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function hexInput(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('input.cp-hex')
}

function alphaInput(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('input.cp-alpha-input')
}

describe('ColorPicker', () => {
  it('initializes hex and alpha from a hex prop', () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: '#123456' } })
    expect((hexInput(wrapper).element as HTMLInputElement).value).toBe('#123456')
    expect((alphaInput(wrapper).element as HTMLInputElement).value).toBe('100')
  })

  it('parses rgba props into hex plus alpha percent', () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: 'rgba(255,0,0,0.5)' } })
    expect((hexInput(wrapper).element as HTMLInputElement).value).toBe('#ff0000')
    expect((alphaInput(wrapper).element as HTMLInputElement).value).toBe('50')
  })

  it('falls back to white for empty values', () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: '' } })
    expect((hexInput(wrapper).element as HTMLInputElement).value).toBe('#ffffff')
  })

  it('re-syncs when the prop changes externally', async () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: '#123456' } })
    await wrapper.setProps({ modelValue: '#abcdef' })
    expect((hexInput(wrapper).element as HTMLInputElement).value).toBe('#abcdef')
  })

  it('emits hex after debounce when alpha is opaque', async () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: '#123456' } })
    await hexInput(wrapper).setValue('#654321')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(60)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['#654321'])
  })

  it('holds partial hex input without emitting', async () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: '#123456' } })
    await hexInput(wrapper).setValue('#65')
    await vi.advanceTimersByTimeAsync(100)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('emits rgba with two-decimal alpha when translucent', async () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: '#ff0000' } })
    await alphaInput(wrapper).setValue('33')
    await vi.advanceTimersByTimeAsync(60)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['rgba(255,0,0,0.33)'])
  })

  it('clamps the alpha percent to 0–100', async () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: '#ff0000' } })
    await alphaInput(wrapper).setValue('250')
    await vi.advanceTimersByTimeAsync(60)
    // 250 clamps to 100 → opaque → plain hex
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['#ff0000'])
  })

  it('emits on swatch change after picking a color', async () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: '#123456' } })
    const swatch = wrapper.find('input.cp-swatch')
    await swatch.setValue('#00ff00')
    await swatch.trigger('change')
    await vi.advanceTimersByTimeAsync(60)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['#00ff00'])
  })
})
