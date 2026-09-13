import { describe, expect, it, vi, afterEach } from 'vitest'
import { isOverlayPluginHost, openExternalUrl } from '../externalLink'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isOverlayPluginHost', () => {
  it('is false with no window', () => {
    expect(isOverlayPluginHost()).toBe(false)
  })

  it('is false in a plain browser window', () => {
    vi.stubGlobal('window', { open: vi.fn() })
    expect(isOverlayPluginHost()).toBe(false)
  })

  it('detects the modern handler', () => {
    vi.stubGlobal('window', { callOverlayHandler: vi.fn() })
    expect(isOverlayPluginHost()).toBe(true)
  })

  it('detects the legacy API', () => {
    vi.stubGlobal('window', { OverlayPluginApi: { callHandler: vi.fn() } })
    expect(isOverlayPluginHost()).toBe(true)
  })
})

describe('openExternalUrl', () => {
  it('uses the modern overlay handler when present', async () => {
    const callOverlayHandler = vi.fn().mockResolvedValue({ ok: true })
    const open = vi.fn()
    vi.stubGlobal('window', { callOverlayHandler, open })
    openExternalUrl('https://example.com/x')
    expect(callOverlayHandler).toHaveBeenCalledWith({
      call: 'openWebsiteWithDefaultBrowser',
      url: 'https://example.com/x',
    })
    // handler path wins — no new tab
    await Promise.resolve()
    expect(open).not.toHaveBeenCalled()
  })

  it('falls back to a new tab when the modern handler rejects', async () => {
    const callOverlayHandler = vi.fn().mockRejectedValue(new Error('nope'))
    const open = vi.fn()
    vi.stubGlobal('window', { callOverlayHandler, open })
    openExternalUrl('https://example.com/x')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener')
  })

  it('falls back to a new tab when the modern handler answers with an error', async () => {
    const callOverlayHandler = vi.fn().mockResolvedValue({ error: 'Unknown overlay call' })
    const open = vi.fn()
    vi.stubGlobal('window', { callOverlayHandler, open })
    openExternalUrl('https://example.com/x')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener')
  })

  it('falls back when the handler answers null (no live host behind it)', async () => {
    const callOverlayHandler = vi.fn().mockResolvedValue(null)
    const open = vi.fn()
    vi.stubGlobal('window', { callOverlayHandler, open })
    openExternalUrl('https://example.com/x')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener')
  })

  it('treats a non-empty answer as accepted', async () => {
    const callOverlayHandler = vi.fn().mockResolvedValue({})
    const open = vi.fn()
    vi.stubGlobal('window', { callOverlayHandler, open })
    openExternalUrl('https://example.com/x')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(open).not.toHaveBeenCalled()
  })

  it('falls back when the modern handler never settles', async () => {
    const callOverlayHandler = vi.fn().mockReturnValue(new Promise(() => {}))
    const open = vi.fn()
    vi.stubGlobal('window', { callOverlayHandler, open })
    openExternalUrl('https://example.com/x', 10)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener')
  })

  it('uses the legacy API when that is all there is', () => {
    const callHandler = vi.fn()
    const open = vi.fn()
    vi.stubGlobal('window', { OverlayPluginApi: { callHandler }, open })
    openExternalUrl('https://example.com/x')
    expect(callHandler.mock.calls[0][0]).toBe(
      JSON.stringify({ call: 'openWebsiteWithDefaultBrowser', url: 'https://example.com/x' }),
    )
    expect(open).not.toHaveBeenCalled()
  })

  it('falls back to a new tab when the legacy API answers with an error', () => {
    const callHandler = vi.fn((_json: string, cb?: (r: string) => void) => {
      cb?.('{"error":"unknown call"}')
    })
    const open = vi.fn()
    vi.stubGlobal('window', { OverlayPluginApi: { callHandler }, open })
    openExternalUrl('https://example.com/x')
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener')
  })

  it('falls back when the legacy API never answers', async () => {
    const callHandler = vi.fn()
    const open = vi.fn()
    vi.stubGlobal('window', { OverlayPluginApi: { callHandler }, open })
    openExternalUrl('https://example.com/x', 10)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener')
  })

  it('copies the URL when popups are blocked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', { open: vi.fn().mockReturnValue(null), navigator: { clipboard: { writeText } } })
    openExternalUrl('https://example.com/x')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(writeText).toHaveBeenCalledWith('https://example.com/x')
  })

  it('opens a new tab in a plain browser', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })
    openExternalUrl('https://example.com/x')
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener')
  })

  it('does nothing with no window', () => {
    expect(() => openExternalUrl('https://example.com/x')).not.toThrow()
  })
})
