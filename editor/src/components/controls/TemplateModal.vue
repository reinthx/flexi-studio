<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  show: boolean
  leftTemplate: string
  rightTemplate: string
}>()

const emit = defineEmits<{
  close: []
  save: [left: string, right: string]
}>()

const left = ref(props.leftTemplate)
const right = ref(props.rightTemplate)

watch(() => props.show, (v) => {
  if (v) {
    left.value = props.leftTemplate
    right.value = props.rightTemplate
  }
})

const leftRef = ref<HTMLInputElement | null>(null)
const rightRef = ref<HTMLInputElement | null>(null)
const lastFocused = ref<'left' | 'right'>('left')

const TOKENS = [
  { token: '{name}',     label: 'Name' },
  { token: '{job}',      label: 'Job' },
  { token: '{icon}',     label: 'Icon' },
  { token: '{rank}',     label: 'Rank' },
  { token: '{value}',    label: 'DPS' },
  { token: '{pct}',      label: 'Total DPS %' },
  { token: '{crithit%}', label: 'Crit Hit %' },
  { token: '{directhit%}', label: 'Direct Hit %' },
  { token: '{enchps}',   label: 'HPS' },
]

function insertToken(token: string) {
  const inputRef = lastFocused.value === 'left' ? leftRef : rightRef
  const el = inputRef.value
  if (!el) return
  const start = el.selectionStart ?? el.value.length
  const end   = el.selectionEnd   ?? el.value.length
  const current = lastFocused.value === 'left' ? left.value : right.value
  const next = current.slice(0, start) + token + current.slice(end)
  if (lastFocused.value === 'left') left.value = next
  else right.value = next
  setTimeout(() => {
    el.setSelectionRange(start + token.length, start + token.length)
    el.focus()
  }, 0)
}

function save() {
  emit('save', left.value, right.value)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal">
        <div class="modal-header">
          <span>Edit Label Templates</span>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>

        <div class="modal-body">
          <div class="field">
            <label class="field-label">Left Template</label>
            <input ref="leftRef" v-model="left" type="text" class="field-input"
              placeholder="{icon} {name}"
              @focus="lastFocused = 'left'" />
          </div>

          <div class="field">
            <label class="field-label">Right Template</label>
            <input ref="rightRef" v-model="right" type="text" class="field-input"
              placeholder="{value} ({pct})"
              @focus="lastFocused = 'right'" />
          </div>

          <div class="token-section">
            <label class="field-label">Insert Token</label>
            <p class="hint">Click a token to insert it at the cursor in the focused template field.</p>
            <div class="token-grid">
              <button v-for="t in TOKENS" :key="t.token"
                class="token-btn" @click="insertToken(t.token)" :title="t.token">
                {{ t.label }}
              </button>
            </div>
          </div>

          <div class="preview-section">
            <label class="field-label">Preview</label>
            <div class="preview-row">
              <span class="preview-left">{{ left }}</span>
              <span class="preview-right">{{ right }}</span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="$emit('close')">Cancel</button>
          <button class="btn btn-primary" @click="save">Save</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
}
.modal {
  background: var(--bg-panel, #16161f);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 8px;
  width: 480px; max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px; font-weight: 600;
}
.close-btn {
  background: none; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer;
  padding: 2px 6px; border-radius: 4px;
}
.close-btn:hover { background: var(--bg-hover); color: var(--text); }
.modal-body {
  padding: 16px;
  display: flex; flex-direction: column; gap: 16px;
}
.field { display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.field-input {
  height: 32px; background: var(--bg-control, #1e1e2e); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text); font-size: 13px; padding: 0 10px; outline: none;
  font-family: 'Consolas', 'Courier New', monospace;
}
.field-input:focus { border-color: var(--accent); }
.hint { font-size: 11px; color: var(--text-muted); margin: 0; }
.token-section { display: flex; flex-direction: column; gap: 6px; }
.token-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.token-btn {
  height: 26px; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text-muted); font-size: 11px; padding: 0 10px; cursor: pointer;
  transition: all 0.15s;
}
.token-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
.preview-section { display: flex; flex-direction: column; gap: 4px; }
.preview-row {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  padding: 6px 10px; font-size: 12px; color: var(--text-muted);
  font-family: 'Consolas', 'Courier New', monospace;
}
.preview-left { opacity: 0.7; }
.preview-right { opacity: 0.7; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 16px; border-top: 1px solid var(--border);
}
.btn {
  height: 30px; padding: 0 16px; border-radius: 4px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--border);
}
.btn-secondary { background: var(--bg-control); color: var(--text); }
.btn-secondary:hover { background: var(--bg-hover); }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover { opacity: 0.9; }
</style>
