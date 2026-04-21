<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePresetsStore, type CustomPreset } from '../../stores/presets'

const store = usePresetsStore()

function getOrientationIcon(profile: { global?: { orientation?: string } }) {
  return profile.global?.orientation === 'horizontal' ? '↔' : '↕'
}

// ── Confirm modal ────────────────────────────────────────────────────────────
const showConfirmModal = ref(false)
const confirmMessage = ref('')
const confirmCallback = ref<(() => void) | null>(null)

function showConfirm(message: string, cb: () => void) {
  confirmMessage.value = message
  confirmCallback.value = cb
  showConfirmModal.value = true
}

function runConfirm() {
  confirmCallback.value?.()
  showConfirmModal.value = false
  confirmCallback.value = null
}

// ── Save preset ──────────────────────────────────────────────────────────────
const newPresetName = ref('')
const saveToCategoryName = ref('')

function savePreset() {
  const name = newPresetName.value.trim()
  if (!name) return
  if (store.customPresets.some(p => p.name === name)) {
    showConfirm(`A preset named "${name}" already exists. Overwrite it?`, () => {
      const idx = store.customPresets.findIndex(p => p.name === name)
      store.updateCustomPreset(idx)
      newPresetName.value = ''
    })
  } else {
    store.addCustomPreset(name, saveToCategoryName.value)
    newPresetName.value = ''
  }
}

// ── Custom preset actions ────────────────────────────────────────────────────
function updatePreset(idx: number) {
  const preset = store.customPresets[idx]
  if (!preset) return
  showConfirm(`Overwrite "${preset.name}" with current settings?`, () => {
    store.updateCustomPreset(idx)
  })
}

function deletePreset(idx: number) {
  const preset = store.customPresets[idx]
  if (!preset) return
  showConfirm(`Delete preset "${preset.name}"?`, () => {
    store.removeCustomPreset(idx)
  })
}

// ── Export ────────────────────────────────────────────────────────────────────
const showExportModal = ref(false)
const exportJson = ref('')

async function exportSingle(idx: number) {
  exportJson.value = await store.exportPreset(idx)
  showExportModal.value = true
}

async function exportAll() {
  exportJson.value = await store.exportAll()
  showExportModal.value = true
}

function closeExportModal() {
  showExportModal.value = false
  exportJson.value = ''
}

function copyExportJson() {
  if (!exportJson.value) return
  navigator.clipboard?.writeText(exportJson.value).catch(() => {
    // Fallback for older browsers / CEF
    const ta = document.createElement('textarea')
    ta.value = exportJson.value
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* ignore */ }
    document.body.removeChild(ta)
  })
}

// ── Import ───────────────────────────────────────────────────────────────────
const showImportModal = ref(false)
const importJson = ref('')
const importError = ref('')
const showConflictModal = ref(false)
const pendingImport = ref<CustomPreset[]>([])

function closeImportModal() {
  showImportModal.value = false
  importJson.value = ''
  importError.value = ''
  pendingImport.value = []
  showConflictModal.value = false
}

async function submitImport() {
  const input = importJson.value.trim()
  if (!input) return
  const result = await store.importFromString(input)
  if (result.imported.length === 0) { importError.value = 'Invalid data'; return }

  if (result.conflicts.length > 0) {
    pendingImport.value = result.imported.filter(p => result.conflicts.includes(p.name))
    const nonConflicting = result.imported.filter(p => !result.conflicts.includes(p.name))
    if (nonConflicting.length > 0) store.addImportedPresets(nonConflicting)
    showImportModal.value = false
    showConflictModal.value = true
  } else {
    store.addImportedPresets(result.imported)
    closeImportModal()
  }
}

function handleConflict(overwrite: boolean) {
  if (overwrite) {
    store.handleConflictOverwrite(pendingImport.value)
  } else {
    store.handleConflictCopy(pendingImport.value)
  }
  pendingImport.value = []
  showConflictModal.value = false
}

function importFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    importJson.value = (reader.result as string).trim()
    await submitImport()
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

// ── New category ─────────────────────────────────────────────────────────────
const showNewCategory = ref(false)
const newCategoryName = ref('')

function createCategory() {
  const name = newCategoryName.value.trim()
  if (!name) return
  store.addCategory(name)
  newCategoryName.value = ''
  showNewCategory.value = false
}

// ── Rename category ──────────────────────────────────────────────────────────
const renamingCategory = ref('')
const renameCategoryValue = ref('')

function startRenameCategory(name: string) {
  renamingCategory.value = name
  renameCategoryValue.value = name
}

function finishRenameCategory() {
  if (renameCategoryValue.value.trim() && renameCategoryValue.value !== renamingCategory.value) {
    store.renameCategory(renamingCategory.value, renameCategoryValue.value.trim())
  }
  renamingCategory.value = ''
}

// ── Drag and drop ────────────────────────────────────────────────────────────
const dragIndex = ref(-1)
const dropTarget = ref<string | null>(null)

function onDragStart(globalIndex: number, e: DragEvent) {
  dragIndex.value = globalIndex
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(globalIndex))
  }
}

function onDragOver(category: string, e: DragEvent) {
  if (dragIndex.value < 0) return
  e.preventDefault()
  dropTarget.value = category
}

function onDragLeave() {
  dropTarget.value = null
}

function onDrop(category: string) {
  if (dragIndex.value >= 0) {
    store.movePresetToCategory(dragIndex.value, category)
  }
  dragIndex.value = -1
  dropTarget.value = null
}

function onDragEnd() {
  dragIndex.value = -1
  dropTarget.value = null
}

// ── Computed views ───────────────────────────────────────────────────────────
const orderedCategories = computed(() => store.categories)

const categoryOptions = computed(() => [
  { value: '', label: 'Uncategorized' },
  ...store.categories.map(c => ({ value: c.name, label: c.name })),
])
</script>

<template>
  <div class="preset-panel">
    <!-- Built-in presets -->
    <div class="category-section" :class="{ 'drag-over': dropTarget === '__builtin' }">
      <div class="category-header" @click="store.toggleCategoryCollapse('__builtin')">
        <span class="cat-chevron" :class="{ open: !store.builtInCollapsed }">›</span>
        <span class="cat-title">Built-in</span>
        <span class="cat-count">{{ store.builtInPresets.length }}</span>
      </div>
      <div v-if="!store.builtInCollapsed" class="category-body">
        <div v-if="store.builtInLoading" class="loading-hint">Loading presets…</div>
        <div v-else class="preset-list">
          <button
            v-for="(p, idx) in store.builtInPresets" :key="p.filename"
            class="preset-btn full"
            :class="{ active: store.activePresetKey === `builtin:${p.name}` }"
            @click="store.applyBuiltIn(idx)"
          >{{ p.name }}
            <span class="preset-orientation">{{ getOrientationIcon(p.profile) }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Custom categories -->
    <div
      v-for="cat in orderedCategories" :key="cat.name"
      class="category-section"
      :class="{ 'drag-over': dropTarget === cat.name }"
      @dragover="onDragOver(cat.name, $event)"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop(cat.name)"
    >
      <div class="category-header" @click="store.toggleCategoryCollapse(cat.name)">
        <span class="cat-chevron" :class="{ open: !cat.collapsed }">›</span>
        <template v-if="renamingCategory === cat.name">
          <input
            class="cat-rename-input"
            v-model="renameCategoryValue"
            @click.stop
            @keyup.enter="finishRenameCategory"
            @blur="finishRenameCategory"
            autofocus
          />
        </template>
        <template v-else>
          <span class="cat-title">{{ cat.name }}</span>
          
        </template>
        <div class="cat-actions" @click.stop>
          <button class="cat-action-btn" @click="startRenameCategory(cat.name)" title="Rename">✎</button>
          <button class="cat-action-btn" @click="store.deleteCategory(cat.name)" title="Delete category">×</button>
        </div>
        <span class="cat-count">{{ store.presetsInCategory(cat.name).length }}</span>
      </div>
      <div v-if="!cat.collapsed" class="category-body">
        <div class="preset-list">
          <div
            v-for="{ preset, globalIndex } in store.presetsInCategory(cat.name)"
            :key="globalIndex"
            class="preset-row"
            draggable="true"
            @dragstart="onDragStart(globalIndex, $event)"
            @dragend="onDragEnd"
          >
            <span class="drag-handle">⠿</span>
            <button
              class="preset-btn full"
              :class="{ active: store.activePresetKey === `custom:${preset.name}` }"
              @click="store.applyCustom(globalIndex)"
            >
              {{ preset.name }}
              <span class="preset-orientation">{{ getOrientationIcon(preset.profile) }}</span>
              <span class="preset-exports" @click.stop="exportSingle(globalIndex)">Export</span>
            </button>
            <button class="preset-btn mini" @click="updatePreset(globalIndex)" title="Save">💾</button>
            <button class="preset-btn mini" @click="deletePreset(globalIndex)" title="Delete">×</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Uncategorized -->
    <div
      class="category-section"
      :class="{ 'drag-over': dropTarget === '' }"
      @dragover="onDragOver('', $event)"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop('')"
      v-if="store.uncategorizedPresets.length > 0"
    >
      <div class="category-header" @click="store.toggleCategoryCollapse('__uncategorized')">
        <span class="cat-chevron open">›</span>
        <span class="cat-title">Uncategorized</span>
        <span class="cat-count">{{ store.uncategorizedPresets.length }}</span>
      </div>
      <div class="category-body">
        <div class="preset-list">
          <div
            v-for="{ preset, globalIndex } in store.uncategorizedPresets"
            :key="globalIndex"
            class="preset-row"
            draggable="true"
            @dragstart="onDragStart(globalIndex, $event)"
            @dragend="onDragEnd"
          >
            <span class="drag-handle">⠿</span>
            <button
              class="preset-btn full"
              :class="{ active: store.activePresetKey === `custom:${preset.name}` }"
              @click="store.applyCustom(globalIndex)"
            >
              {{ preset.name }}
              <span class="preset-orientation">{{ getOrientationIcon(preset.profile) }}</span>
              <span class="preset-exports" @click.stop="exportSingle(globalIndex)">Export</span>
            </button>
            <button class="preset-btn mini" @click="updatePreset(globalIndex)" title="Save">💾</button>
            <button class="preset-btn mini" @click="deletePreset(globalIndex)" title="Delete">×</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions bar -->
    <div class="preset-actions">
      <input
        v-model="newPresetName"
        class="preset-input"
        placeholder="Preset name"
        @keyup.enter="savePreset"
      />
      <select v-if="store.categories.length > 0" v-model="saveToCategoryName" class="preset-select">
        <option v-for="opt in categoryOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <button class="preset-btn" @click="savePreset" :disabled="!newPresetName.trim()">Save</button>
    </div>
    <div class="preset-actions">
      <button class="preset-btn" @click="showImportModal = true">Import</button>
      <button class="preset-btn" v-if="store.customPresets.length > 0" @click="exportAll">Export All</button>
      <label class="preset-btn file-label">
        Import File
        <input type="file" accept=".flexi,.json,.txt" style="display:none" @change="importFile" />
      </label>
    </div>
    <div class="preset-actions">
      <template v-if="showNewCategory">
        <input
          v-model="newCategoryName"
          class="preset-input"
          placeholder="Category name"
          @keyup.enter="createCategory"
          @keyup.escape="showNewCategory = false"
          autofocus
        />
        <button class="preset-btn" @click="createCategory" :disabled="!newCategoryName.trim()">Add</button>
        <button class="preset-btn" @click="showNewCategory = false">Cancel</button>
      </template>
      <button v-else class="preset-btn" @click="showNewCategory = true">+ Category</button>
    </div>
  </div>

  <!-- Export Modal -->
  <Teleport to="body">
    <div v-if="showExportModal" class="modal-overlay" @click="closeExportModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span>Export Presets</span>
          <button class="modal-close" @click="closeExportModal">×</button>
        </div>
        <div class="modal-body">
          <textarea class="modal-textarea" :value="exportJson" readonly></textarea>
        </div>
        <div class="modal-footer">
          <button class="preset-btn" @click="copyExportJson">Copy to Clipboard</button>
        </div>
      </div>
    </div>

    <!-- Import Modal -->
    <div v-if="showImportModal" class="modal-overlay" @click="closeImportModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span>Import Presets</span>
          <button class="modal-close" @click="closeImportModal">×</button>
        </div>
        <div class="modal-body">
          <textarea class="modal-textarea" v-model="importJson" placeholder="Paste share string or JSON here..."></textarea>
          <span v-if="importError" class="error-msg">{{ importError }}</span>
        </div>
        <div class="modal-footer">
          <button class="preset-btn" @click="submitImport" :disabled="!importJson.trim()">Import</button>
        </div>
      </div>
    </div>

    <!-- Conflict Modal -->
    <div v-if="showConflictModal" class="modal-overlay" @click="showConflictModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span>Preset Already Exists</span>
          <button class="modal-close" @click="showConflictModal = false">×</button>
        </div>
        <div class="modal-body">
          <p>The following presets already exist:</p>
          <div class="conflict-list">
            <div v-for="p in pendingImport" :key="p.name" class="conflict-item">{{ p.name }}</div>
          </div>
          <p>What would you like to do?</p>
        </div>
        <div class="modal-footer">
          <button class="conflict-btn" @click="handleConflict(true)">Overwrite</button>
          <button class="conflict-btn" @click="handleConflict(false)">Create Copy</button>
        </div>
      </div>
    </div>

    <!-- Confirm Modal -->
    <div v-if="showConfirmModal" class="modal-overlay" @click="showConfirmModal = false">
      <div class="modal-content modal-confirm" @click.stop>
        <div class="modal-header">
          <span>Confirm</span>
          <button class="modal-close" @click="showConfirmModal = false">×</button>
        </div>
        <div class="modal-body">
          <p>{{ confirmMessage }}</p>
        </div>
        <div class="modal-footer">
          <button class="conflict-btn" @click="runConfirm">Yes</button>
          <button class="conflict-btn" @click="showConfirmModal = false">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.preset-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* ── Category sections ─────────────────────────────────────────────────────── */
.category-section {
  border: 1px solid transparent;
  border-radius: 4px;
  transition: border-color 0.15s;
}
.category-section.drag-over {
  border-color: var(--accent);
  background: rgba(155, 93, 229, 0.05);
}
.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  cursor: pointer;
  user-select: none;
  border-radius: 3px;
  transition: background 0.1s;
}
.category-header:hover {
  background: var(--bg-hover);
}
.cat-chevron {
  font-size: 12px;
  color: var(--text-muted);
  transform: rotate(0deg);
  transition: transform 0.15s;
  line-height: 1;
  flex-shrink: 0;
  width: 12px;
  text-align: center;
}
.cat-chevron.open { transform: rotate(90deg); }
.cat-title {
  flex: 1;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.cat-count {
  font-size: 9px;
  color: var(--text-muted);
  background: var(--bg-control);
  padding: 1px 5px;
  border-radius: 8px;
}
.cat-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.1s;
}
.category-header:hover .cat-actions { opacity: 1; }
.cat-action-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  padding: 0 3px;
  line-height: 1;
}
.cat-action-btn:hover { color: var(--text); }
.cat-rename-input {
  flex: 1;
  background: var(--bg-control);
  border: 1px solid var(--accent);
  border-radius: 3px;
  color: var(--text);
  font-size: 10px;
  padding: 2px 6px;
  outline: none;
}
.category-body {
  padding: 0 0 4px 18px;
}
.loading-hint {
  font-size: 10px;
  color: var(--text-muted);
  padding: 4px 0;
}

/* ── Preset list ───────────────────────────────────────────────────────────── */
.preset-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
/* ── Preset row (draggable) ────────────────────────────────────────────────── */
.preset-row {
  display: flex;
  gap: 3px;
  align-items: center;
}
.preset-row[draggable="true"] {
  cursor: grab;
}
.preset-row[draggable="true"]:active {
  cursor: grabbing;
}
.drag-handle {
  font-size: 10px;
  color: var(--text-muted);
  cursor: grab;
  user-select: none;
  line-height: 1;
  padding: 0 2px;
  opacity: 0.4;
}
.preset-row:hover .drag-handle { opacity: 1; }

/* ── Buttons ───────────────────────────────────────────────────────────────── */
.preset-btn {
  background: var(--bg-control);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 11px;
  padding: 3px 10px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}
.preset-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.preset-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.preset-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.preset-btn.full {
  flex: 1;
  width: 100%;
  text-align: left;
  padding: 5px 10px;
}
.preset-btn.mini {
  padding: 3px 6px;
  font-size: 12px;
  min-width: 24px;
}
.preset-exports {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--bg-hover);
  color: var(--text-muted);
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 3px;
}
.preset-orientation {
  position: absolute;
  right: 50px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1;
}
.preset-exports:hover {
  background: var(--border);
  color: var(--text);
}

/* ── Actions bar ───────────────────────────────────────────────────────────── */
.preset-actions {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.preset-input {
  flex: 1;
  min-width: 70px;
  background: var(--bg-control);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 11px;
  padding: 3px 8px;
}
.preset-input::placeholder { color: var(--text-muted); }
.preset-select {
  background: var(--bg-control);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 10px;
  padding: 2px 4px;
  max-width: 100px;
}
.file-label {
  display: inline-flex;
  align-items: center;
}
.error-msg { color: #e63946; font-size: 11px; }

/* ── Modals ────────────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}
.modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}
.modal-close:hover { color: var(--text); }
.modal-body {
  flex: 1;
  padding: 16px;
  overflow: auto;
}
.modal-textarea {
  width: 100%;
  height: 200px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-family: monospace;
  font-size: 11px;
  padding: 8px;
  resize: none;
}
.modal-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
}
.conflict-list {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px;
  margin: 8px 0;
  max-height: 150px;
  overflow-y: auto;
}
.conflict-item {
  color: var(--text);
  padding: 4px 0;
  font-size: 12px;
}
.conflict-btn {
  background: var(--bg-control);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 14px;
  padding: 10px 24px;
  cursor: pointer;
  transition: all 0.15s;
}
.conflict-btn:hover {
  background: var(--bg-hover);
  color: #fff;
}
.modal-confirm { max-width: 320px; }
</style>
