<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConfigStore } from '../../stores/config'
import type { Role, Job } from '@shared/configSchema'
import { JOB_COLORS } from '@shared/presets'
import ColorPicker from './ColorPicker.vue'

const config = useConfigStore()
const def = computed(() => config.profile.default)
const overrides = computed(() => config.profile.overrides)

const isGradient = computed(() => {
  const fill = def.value.fill
  if (fill?.type === 'gradient') return true
  if (fill?.type === 'texture' && fill.texture?.tintGradient) return true
  return false
})

const collapsed = ref({ self: true, roles: true, jobs: true })

const ROLES: Role[] = ['tank', 'healer', 'melee', 'ranged', 'caster']
const ROLE_LABELS: Record<Role, string> = {
  tank: 'Tank', healer: 'Healer', melee: 'Melee', ranged: 'Ranged', caster: 'Caster'
}

// Jobs grouped by role for display
const JOB_GROUPS: { role: Role; jobs: Job[] }[] = [
  { role: 'tank',   jobs: ['PLD', 'WAR', 'DRK', 'GNB'] },
  { role: 'healer', jobs: ['WHM', 'SCH', 'AST', 'SGE'] },
  { role: 'melee',  jobs: ['MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR'] },
  { role: 'ranged', jobs: ['BRD', 'MCH', 'DNC'] },
  { role: 'caster', jobs: ['BLM', 'SMN', 'RDM', 'PCT', 'BLU'] },
]

const ROLE_COLORS: Record<Role, string> = {
  tank: '#4a90d9', healer: '#52b788', melee: '#e63946', ranged: '#f4a261', caster: '#9b5de5'
}

// Collapsed state for each job sub-group
const jobGroupOpen = ref<Record<Role, boolean>>({
  tank: false, healer: false, melee: false, ranged: false, caster: false,
})

function getRoleColor(role: Role): string {
  return overrides.value.byRole[role]?.fill?.type === 'solid'
    ? overrides.value.byRole[role].fill.color
    : ROLE_COLORS[role]
}

function getRoleGradColor(role: Role): string {
  return overrides.value.byRole[role]?.gradientColor ?? '#000000'
}

function setRoleColor(role: Role, color: string) {
  config.patchOverrides({
    byRole: {
      ...overrides.value.byRole,
      [role]: { ...overrides.value.byRole[role], fill: { type: 'solid', color } }
    }
  })
}

function setRoleGradColor(role: Role, color: string) {
  config.patchOverrides({
    byRole: {
      ...overrides.value.byRole,
      [role]: { ...overrides.value.byRole[role], fill: { type: 'solid', color: getRoleColor(role) }, gradientColor: color }
    }
  })
}

function getJobColor(job: Job): string {
  return overrides.value.byJob[job]?.fill?.type === 'solid'
    ? overrides.value.byJob[job].fill.color
    : JOB_COLORS[job] ?? '#888888'
}

function getJobGradColor(job: Job): string {
  return overrides.value.byJob[job]?.gradientColor ?? '#000000'
}

function setJobColor(job: Job, color: string) {
  config.patchOverrides({
    byJob: {
      ...overrides.value.byJob,
      [job]: { ...overrides.value.byJob[job], fill: { type: 'solid', color } }
    }
  })
}

function setJobGradColor(job: Job, color: string) {
  config.patchOverrides({
    byJob: {
      ...overrides.value.byJob,
      [job]: { ...overrides.value.byJob[job], fill: { type: 'solid', color: getJobColor(job) }, gradientColor: color }
    }
  })
}

function getSelfColor(): string {
  return overrides.value.self?.fill?.type === 'solid'
    ? overrides.value.self.fill.color
    : '#888888'
}

function getSelfGradColor(): string {
  return overrides.value.self?.gradientColor ?? '#000000'
}

function setSelfColor(color: string) {
  config.patchOverrides({
    self: { ...overrides.value.self, fill: { type: 'solid', color } }
  })
}

function setSelfGradColor(color: string) {
  config.patchOverrides({
    self: { ...overrides.value.self, fill: { type: 'solid', color: getSelfColor() }, gradientColor: color }
  })
}

function restoreDefaultSelf() {
  const defaultColor = '#4a90d9'
  config.patchOverrides({
    self: { fill: { type: 'solid', color: defaultColor } }
  })
}

function getRoleEnabled(role: Role): boolean {
  return overrides.value.byRoleEnabled?.[role] ?? true
}

function setRoleEnabled(role: Role, enabled: boolean) {
  config.patchOverrides({
    byRoleEnabled: { ...overrides.value.byRoleEnabled, [role]: enabled }
  })
}

function getJobEnabled(job: Job): boolean {
  return overrides.value.byJobEnabled?.[job] ?? true
}

function allJobsInGroupEnabled(jobs: Job[]): boolean {
  return jobs.every(job => getJobEnabled(job))
}

function setJobsInGroupEnabled(jobs: Job[], enabled: boolean) {
  const patch: Partial<Record<Job, boolean>> = {}
  for (const job of jobs) patch[job] = enabled
  config.patchOverrides({ byJobEnabled: patch })
}

function setJobEnabled(job: Job, enabled: boolean) {
  config.patchOverrides({ byJobEnabled: { [job]: enabled } })
}

function restoreDefaultJob(job: Job) {
  const defaultColor = JOB_COLORS[job] ?? '#888888'
  config.patchOverrides({
    byJob: { ...overrides.value.byJob, [job]: { fill: { type: 'solid', color: defaultColor } } }
  })
}

function restoreDefaultRole(role: Role) {
  const defaultColor = ROLE_COLORS[role]
  config.patchOverrides({
    byRole: { ...overrides.value.byRole, [role]: { fill: { type: 'solid', color: defaultColor } } }
  })
}

function onSelfToggle(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  config.patchOverrides({ selfEnabled: checked })
}
</script>

<template>
  <div class="color-editor">

    <!-- ── By Role ── -->
    <button class="section-btn" @click="collapsed.roles = !collapsed.roles">
      <span class="section-icon" :style="{ transform: collapsed.roles ? 'none' : 'rotate(90deg)' }">▸</span>
      <span class="section-label">By Role</span>
    </button>
    <div v-if="!collapsed.roles" class="section-body">
      <template v-for="role in ROLES" :key="role">
        <div class="color-row">
          <input type="checkbox" class="role-checkbox"
            :checked="getRoleEnabled(role)"
            @change="e => setRoleEnabled(role, (e.target as HTMLInputElement).checked)" />
          <label class="ctrl-label">{{ ROLE_LABELS[role] }}</label>
          <ColorPicker :model-value="getRoleColor(role)" @update:model-value="c => setRoleColor(role, c)" />
          <button class="restore-btn" title="Restore default" @click="restoreDefaultRole(role)">↺</button>
        </div>
        <template v-if="isGradient && getRoleEnabled(role)">
          <div class="color-row grad-row">
            <span class="grad-label">Color 2</span>
            <ColorPicker :model-value="getRoleGradColor(role)" @update:model-value="c => setRoleGradColor(role, c)" />
          </div>
        </template>
      </template>
    </div>

    <!-- ── By Job ── -->
    <button class="section-btn" @click="collapsed.jobs = !collapsed.jobs">
      <span class="section-icon" :style="{ transform: collapsed.jobs ? 'none' : 'rotate(90deg)' }">▸</span>
      <span class="section-label">By Job</span>
    </button>
    <div v-if="!collapsed.jobs" class="section-body">
      <div v-for="group in JOB_GROUPS" :key="group.role" class="job-group">
        <!-- Group header row: role color swatch + toggle + expand -->
        <div class="group-header" @click="jobGroupOpen[group.role] = !jobGroupOpen[group.role]">
          <span class="group-icon" :style="{ transform: jobGroupOpen[group.role] ? 'rotate(90deg)' : 'none' }">▸</span>
          <input type="checkbox" class="role-checkbox"
            :checked="allJobsInGroupEnabled(group.jobs)"
            @click.stop
            @change="e => setJobsInGroupEnabled(group.jobs, (e.target as HTMLInputElement).checked)" />
          <span class="group-dot" :style="{ background: ROLE_COLORS[group.role] }" />
          <span class="group-label">{{ ROLE_LABELS[group.role] }}</span>
        </div>

        <!-- Job rows within group -->
        <div v-if="jobGroupOpen[group.role]" class="job-rows">
          <template v-for="job in group.jobs" :key="job">
            <div class="color-row job-row">
              <input type="checkbox" class="job-checkbox"
                :checked="getJobEnabled(job)"
                @change="e => setJobEnabled(job, (e.target as HTMLInputElement).checked)" />
              <label class="ctrl-label">{{ job }}</label>
              <template v-if="getJobEnabled(job)">
                <ColorPicker :model-value="getJobColor(job)" @update:model-value="c => setJobColor(job, c)" />
                <button class="restore-btn" title="Restore default" @click="restoreDefaultJob(job)">↺</button>
              </template>
            </div>
            <template v-if="isGradient && getJobEnabled(job)">
              <div class="color-row grad-row">
                <span class="grad-label">Color 2</span>
                <ColorPicker :model-value="getJobGradColor(job)" @update:model-value="c => setJobGradColor(job, c)" />
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>

    <!-- ── Self ── -->
    <button class="section-btn" @click="collapsed.self = !collapsed.self">
      <span class="section-icon" :style="{ transform: collapsed.self ? 'none' : 'rotate(90deg)' }">▸</span>
      <span class="section-label">Self</span>
    </button>
    <div v-if="!collapsed.self" class="section-body">
      <div class="color-row">
        <input type="checkbox" class="role-checkbox"
          :checked="overrides.selfEnabled"
          @change="onSelfToggle" />
        <label class="ctrl-label">Self Bar</label>
        <ColorPicker :model-value="getSelfColor()" @update:model-value="setSelfColor" />
        <button class="restore-btn" title="Restore default" @click="restoreDefaultSelf()">↺</button>
      </div>
      <template v-if="isGradient && overrides.selfEnabled">
        <div class="color-row grad-row">
          <span class="grad-label">Color 2</span>
          <ColorPicker :model-value="getSelfGradColor()" @update:model-value="setSelfGradColor" />
        </div>
      </template>
    </div>

  </div>
</template>

<style scoped>
.color-editor { display: flex; flex-direction: column; gap: var(--control-gap-sm); min-width: 0; }

.section-btn {
  display: flex; align-items: center; gap: var(--control-gap-sm);
  background: none; border: none; padding: var(--control-gap-sm) 0; cursor: pointer;
  width: 100%; text-align: left;
}
.section-btn:hover .section-label { color: var(--text); }
.section-btn:focus { outline: none; }
.section-btn:focus-visible { outline: 1px solid var(--text-muted); }
.section-icon { font-size: 10px; color: var(--text-muted); transition: transform 0.15s; }
.section-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; transition: color 0.15s; flex: 1; }
.section-body { display: flex; flex-direction: column; gap: var(--control-gap-sm); padding-bottom: var(--control-gap-sm); }

/* Job groups */
.job-group { display: flex; flex-direction: column; }
.group-header {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 0 4px 12px; cursor: pointer; user-select: none;
}
.group-header:hover .group-label { color: var(--text); }
.group-icon { font-size: 9px; color: var(--text-muted); transition: transform 0.15s; }
.group-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.group-label { font-size: 11px; color: var(--text-muted); transition: color 0.15s; }
.job-rows { display: flex; flex-direction: column; gap: var(--control-gap-sm); padding: 4px 0 4px 44px; }
.job-row { border: none; }

/* Color rows */
.color-row { display: flex; align-items: center; gap: var(--control-gap-sm); min-width: 0; flex-wrap: nowrap; }
.ctrl-label { font-size: 12px; color: var(--text-muted); min-width: 32px; flex-shrink: 0; text-align: right; }
.grad-row { padding-left: 0; margin-left: 20px; }
.grad-label { font-size: 11px; color: var(--text-muted); min-width: 32px; }

.role-checkbox { width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; }
.job-checkbox  { width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; }

.restore-btn {
  background: none; border: 1px solid var(--border); border-radius: 4px;
  color: var(--text-muted); cursor: pointer; font-size: 13px; padding: 0 5px;
  line-height: 1; height: var(--control-height); flex-shrink: 0;
}
.restore-btn:hover { background: var(--bg-hover); color: var(--text); }
</style>
