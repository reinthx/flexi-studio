<script setup lang="ts">
import type { InspectorRow } from './abilityRows'

defineProps<{
  rows: InspectorRow[]
  heading?: string
}>()
</script>

<template>
  <div class="bp-inspector-block">
    <div v-if="heading" class="bp-section-heading">{{ heading }}</div>
    <div v-for="[label, value] in rows" :key="label" class="bp-kv"><span>{{ label }}</span><strong>{{ value }}</strong></div>
  </div>
</template>
