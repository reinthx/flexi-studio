<script setup lang="ts">
import MeterView from './components/MeterView.vue'
import AbilityBreakdownPopout from './components/AbilityBreakdownPopout.vue'
// Lifecycle (start/stop) is owned by MeterView so it works in both the
// standalone overlay build AND the editor's unified GitHub Pages build.

// window.name is set by window.open(url, 'flexi-breakdown', ...) — reliable in CEF.
// Hash fragments can be stripped by ACT's overlay window management; window.name cannot.
const isBreakdownPopout = window.name === 'flexi-breakdown'
</script>

<template>
  <AbilityBreakdownPopout v-if="isBreakdownPopout" />
  <MeterView v-else />
</template>
