<script setup lang="ts">
import FlexiBar from '@shared/components/FlexiBar.vue'
import type { FlexiBarProps } from '@shared/barRenderer'

const props = defineProps<FlexiBarProps>()
</script>

<template>
  <FlexiBar v-bind="props" />
</template>
