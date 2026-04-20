import { describe, it, expect } from 'vitest'
import { renderTemplate } from '../templateRenderer'

describe('renderTemplate', () => {
  it('replaces single token', () => {
    const result = renderTemplate('Hello {name}!', { name: 'World' })
    expect(result).toBe('Hello World!')
  })

  it('replaces multiple tokens', () => {
    const result = renderTemplate('{greeting} {name}!', { greeting: 'Hello', name: 'World' })
    expect(result).toBe('Hello World!')
  })

  it('leaves unknown tokens as-is', () => {
    const result = renderTemplate('Hello {name} and {friend}!', { name: 'World' })
    expect(result).toBe('Hello World and {friend}!')
  })

  it('removes empty token values cleanly', () => {
    const result = renderTemplate('Hello {name} ({server})', { name: 'World', server: '' })
    expect(result).toBe('Hello World ()')
  })

  it('collapses multiple spaces', () => {
    const result = renderTemplate('Hello    {name}', { name: 'World' })
    expect(result).toBe('Hello World')
  })

  it('trims leading/trailing whitespace', () => {
    const result = renderTemplate('  Hello {name}  ', { name: 'World' })
    expect(result).toBe('Hello World')
  })

  it('handles tokens with % suffix', () => {
    const result = renderTemplate('{dps}%', { dps: '1000' })
    expect(result).toBe('1000%')
  })

  it('handles empty tokens map', () => {
    const result = renderTemplate('Hello {name}!', {})
    expect(result).toBe('Hello {name}!')
  })

  it('handles empty template', () => {
    const result = renderTemplate('', { name: 'World' })
    expect(result).toBe('')
  })
})