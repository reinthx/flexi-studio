<script setup lang="ts">
import type { CSSProperties } from 'vue'

type InspectorListRow = {
  key: string
  title: string
  detail: string
  titleStyle?: CSSProperties
}

defineProps<{
  heading?: string
  emptyText: string
  rows: InspectorListRow[]
}>()
</script>

<template>
  <div class="bp-inspector-block">
    <div v-if="heading" class="bp-section-heading">{{ heading }}</div>
    <div v-if="rows.length === 0" class="bp-empty-panel">{{ emptyText }}</div>
    <div v-for="row in rows" :key="row.key" class="bp-inspector-list-item">
      <strong :style="row.titleStyle">{{ row.title }}</strong>
      <span>{{ row.detail }}</span>
    </div>
  </div>
</template>
