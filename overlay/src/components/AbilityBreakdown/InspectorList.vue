<script setup lang="ts">
defineProps<{
  heading?: string
  emptyText: string
  rows: Array<{ key: string; title: string; detail: string }>
}>()
</script>

<template>
  <div class="bp-inspector-block">
    <div v-if="heading" class="bp-section-heading">{{ heading }}</div>
    <div v-if="rows.length === 0" class="bp-empty-panel">{{ emptyText }}</div>
    <div v-for="row in rows" :key="row.key" class="bp-inspector-list-item">
      <strong>{{ row.title }}</strong>
      <span>{{ row.detail }}</span>
    </div>
  </div>
</template>
