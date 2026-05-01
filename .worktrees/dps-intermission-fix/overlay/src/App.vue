<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import MeterView from './components/MeterView.vue'
// Lifecycle (start/stop) is owned by MeterView so it works in both the
// standalone overlay build AND the editor's unified GitHub Pages build.

// window.name is set by window.open(url, 'flexi-breakdown', ...) — reliable in CEF.
// Hash fragments can be stripped by ACT's overlay window management; window.name cannot.
// Hash/search fallbacks keep browser smoke tests and direct local preview URLs usable.
const routeHash = window.location.hash.slice(1).toLowerCase()
const isBreakdownParam = new URLSearchParams(window.location.search).get('breakdown') === '1'
const isBreakdownPopout = window.name === 'flexi-breakdown' || isBreakdownParam || routeHash === '/breakdown' || routeHash === 'breakdown'

const AbilityBreakdownPopout = defineAsyncComponent(() => import('./components/AbilityBreakdownPopout.vue'))
</script>

<template>
  <AbilityBreakdownPopout v-if="isBreakdownPopout" />
  <MeterView v-else />
</template>
