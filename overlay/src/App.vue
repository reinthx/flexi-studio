<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useLiveDataStore } from './stores/liveData'
import MeterView from './components/MeterView.vue'

const liveData = useLiveDataStore()

onMounted(() => liveData.start())
onUnmounted(() => liveData.stop())
</script>

<template>
  <MeterView />
</template>
