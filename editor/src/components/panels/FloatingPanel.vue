<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { useDraggable, useElementSize } from '@vueuse/core'

const props = withDefaults(defineProps<{
  title: string
  defaultX?: number
  defaultY?: number
  defaultW?: number
  defaultH?: number
  minW?: number
  minH?: number
  resizable?: boolean
}>(), {
  defaultX: 8,
  defaultY: 40,
  defaultW: 260,
  defaultH: 400,
  minW: 180,
  minH: 60,
  resizable: true,
})

const emit = defineEmits<{ close: [] }>()

const collapsed = ref(false)
const panelRef  = useTemplateRef<HTMLElement>('panelEl')
const handleRef = useTemplateRef<HTMLElement>('handleEl')

const { x, y } = useDraggable(panelRef, {
  handle: handleRef,
  initialValue: { x: props.defaultX, y: props.defaultY },
})

const { width, height } = useElementSize(panelRef)
defineExpose({ width, height })
</script>

<template>
  <div
    ref="panelEl"
    class="floating-panel"
    :class="{ 'is-resizable': resizable && !collapsed }"
    :style="{ left: `${x}px`, top: `${y}px`, width: `${defaultW}px`, height: `${defaultH}px` }"
  >
    <div ref="handleEl" class="panel-header">
      <span class="panel-title">{{ title }}</span>
      <div class="header-btns">
        <button class="hdr-btn" @click.stop="collapsed = !collapsed" :title="collapsed ? 'Expand' : 'Collapse'">
          {{ collapsed ? '▶' : '▼' }}
        </button>
        <button class="hdr-btn close" @click.stop="emit('close')" title="Close">×</button>
      </div>
    </div>
    <div v-if="!collapsed" class="panel-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.floating-panel {
  position: fixed;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 5px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  z-index: 100;
  overflow: hidden;
}
.is-resizable {
  resize: both;
  min-width: v-bind('minW + "px"');
  min-height: v-bind('minH + "px"');
}

.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 8px; height: 32px; flex-shrink: 0;
  background: #0d0d1a; border-bottom: 1px solid var(--border);
  cursor: grab; user-select: none; border-radius: 4px 4px 0 0;
}
.panel-header:active { cursor: grabbing; }
.panel-title { font-size: 12px; font-weight: 600; color: var(--text); }
.header-btns { display: flex; align-items: center; gap: 2px; }
.hdr-btn {
  background: none; border: none; color: var(--text-muted);
  font-size: 13px; cursor: pointer; padding: 0 3px; line-height: 1;
}
.hdr-btn:hover { color: var(--text); }
.hdr-btn.close:hover { color: #e63946; }
.panel-content {
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
  flex: 1;
}
</style>
