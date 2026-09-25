/**
 * listWidth.ts
 *
 * Measure a meter list's content width once per list instead of once per bar.
 *
 * FlexiBar used to run one ResizeObserver per row, each writing a width ref
 * that invalidated shape/strip math and re-triggered measurement on the next
 * frame. Rows in a vertical list all share the same width (flex stretch), so
 * a single observer on the list container is exact: contentRect.width equals
 * the row width. The measured width is passed down via the `containerWidth`
 * prop; bars fall back to window width until the first measurement lands.
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export interface ListWidth {
  listWidth: Ref<number>
  /** Stable template-ref sink for the list container element (or component). */
  measureRef: (el: unknown) => void
}

function resolveTarget(el: unknown): HTMLElement | null {
  if (el instanceof HTMLElement) return el
  if (el !== null && typeof el === 'object' && '$el' in el) {
    const inner = (el as { $el: unknown }).$el
    return inner instanceof HTMLElement ? inner : null
  }
  return null
}

export function useListWidth(): ListWidth {
  const listWidth = ref(0)
  let target: HTMLElement | null = null
  let observer: ResizeObserver | null = null

  function update(entries?: ResizeObserverEntry[]): void {
    const w = entries?.[0]?.contentRect?.width ?? target?.clientWidth ?? 0
    if (w > 0) listWidth.value = w
  }

  function onWindowResize(): void {
    update()
  }

  function measureRef(el: unknown): void {
    target = resolveTarget(el)
    if (target) update()
  }

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined' && target) {
      observer = new ResizeObserver(update)
      observer.observe(target)
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', onWindowResize)
    }
  })

  onUnmounted(() => {
    observer?.disconnect()
    observer = null
    if (typeof window !== 'undefined') window.removeEventListener('resize', onWindowResize)
  })

  return { listWidth, measureRef }
}
