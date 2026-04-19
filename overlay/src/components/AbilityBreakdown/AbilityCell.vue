<script setup lang="ts">
import { abilityInitials } from '@shared/abilityIcons'

defineProps<{
  abilityId: string
  abilityName: string
  iconSrc: string
  small?: boolean
}>()

defineEmits<{
  iconError: []
}>()
</script>

<template>
  <span class="ability-cell">
    <span class="breakdown-ability-icon" :class="{ 'breakdown-ability-icon--small': small }">
      <img v-if="iconSrc" :src="iconSrc" :alt="abilityName" @error="$emit('iconError')" />
      <span v-else>{{ abilityInitials(abilityName) }}</span>
    </span>
    {{ abilityName }}
  </span>
</template>

<style scoped>
.ability-cell {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 100%;
  vertical-align: middle;
}
.breakdown-ability-icon {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.16);
  background: linear-gradient(135deg, rgba(255,255,255,0.13), rgba(255,255,255,0.035));
  color: rgba(255,255,255,0.74);
  font-size: 8px;
  font-weight: 800;
  line-height: 1;
}
.breakdown-ability-icon--small {
  width: 18px;
  height: 18px;
  flex-basis: 18px;
  font-size: 7px;
}
.breakdown-ability-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
