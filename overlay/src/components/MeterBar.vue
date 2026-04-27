<script setup lang="ts">
import FlexiBar from '@shared/components/FlexiBar.vue'
import type { FlexiBarProps } from '@shared/barRenderer'

const emit = defineEmits<{ click: [] }>()
const props = defineProps<FlexiBarProps>()
</script>

<template>
  <FlexiBar
    v-bind="props"
    clickable
    validate-style
    expanded-shadow-filter
    @click="emit('click')"
  />
</template>
