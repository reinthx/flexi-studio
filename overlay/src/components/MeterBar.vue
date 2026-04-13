<script setup lang="ts">
import { computed } from 'vue'
import type { BarStyle, Orientation, BarLabel } from '@shared/configSchema'
import { useBarStyles } from '@shared/useBarStyles'
import type { BarData } from '@shared/useBarStyles'
import { renderTemplate } from '../lib/templateRenderer'
import { getJobIconSrc } from '@shared/jobMap'
import { MOCK_NAMES } from '@shared/overlayBridge'
import { formatValue } from '@shared/formatValue'
import type { FormatType } from '@shared/formatValue'

const props = defineProps<{
  bar: BarData
  styleConfig: BarStyle
  orientation: Orientation
  showRank: boolean
  blurName?: boolean
  valueFormat?: 'raw' | 'abbreviated' | 'formatted'
  barIndex?: number
  tabLabelConfig?: BarLabel
}>()

const {
  shapeCss, isClipped, dims, isHorizontal,
  outlineTarget, outlineCss,
  shapeLayerStyle,
  bgShadowDirectionalClip, bgShadowStyle, bgShadowSourceStyle,
  bgStyle, bgTextureInnerStyle,
  fillShadowBoundsStyle, fillShadowWrapStyle, fillStyle, fillTextureInnerStyle,
  label, labelStyle, labelOutlineShadow, processedFields, textStyle, gradientTextStyle,
  showDeath, deathText, deathStyle,
  iconConfig, iconSrc, showIcon, iconSize,
  iconContainerStyle, iconInlineStyle, iconImageStyle,
  iconOutlineStyle, iconBgOutlineStyle, iconBgStyle, iconBgDiamondStyle,
  iconFallback,
} = useBarStyles(() => props.bar, () => props.styleConfig, () => props.orientation, () => props.barIndex ?? 0, () => props.tabLabelConfig)

const isValid = computed(() => {
  const sc = props.styleConfig
  return sc && sc.label && sc.shape && sc.fill && sc.bg
})

const wrapperStyle = computed(() => {
  if (!isValid.value) return { display: 'none' }
  return {
    height: dims.value.height,
    width: dims.value.width,
    marginBottom: dims.value.marginBottom,
    marginRight: dims.value.marginRight,
    opacity: String(props.bar.alpha),
    position: 'relative' as const,
    overflow: 'visible' as const,
    ...(shapeCss.value.borderRadius ? { borderRadius: shapeCss.value.borderRadius } : {}),
  }
})

// ── Blur names ──────────────────────────────────────────────────────────────
const displayName = computed(() => {
  if (props.blurName && MOCK_NAMES.length > 0) {
    return MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)]
  }
  return props.bar.name
})

const blurStyle = computed(() => {
  if (props.blurName) {
    return { filter: 'blur(2px)', opacity: '0.85', userSelect: 'none' as const }
  }
  return undefined
})

// ── Tokens / labels ─────────────────────────────────────────────────────────
// Parses "SkillName 23740" or just "23740" - splits into name + formatted value
const maxHitName = computed(() => {
  const raw = props.bar.maxHit ?? ''
  if (!raw || raw === '---') return raw
  const spaceIdx = raw.lastIndexOf(' ')
  if (spaceIdx < 0) return ''
  return raw.slice(0, spaceIdx)
})

const maxHitValue = computed(() => {
  const raw = props.bar.maxHit ?? ''
  if (!raw || raw === '---') return raw
  const spaceIdx = raw.lastIndexOf(' ')
  const numStr = spaceIdx < 0 ? raw : raw.slice(spaceIdx + 1)
  const suffix = numStr.slice(-1).toUpperCase()
  const multipliers: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 }
  const baseStr = multipliers[suffix] ? numStr.slice(0, -1) : numStr
  const baseNum = parseFloat(baseStr.replace(/,/g, ''))
  if (isNaN(baseNum)) return raw
  const num = multipliers[suffix] ? baseNum * multipliers[suffix] : baseNum
  const fmt: FormatType = props.valueFormat ?? 'abbreviated'
  return formatValue(num, fmt)
})

const maxHit = computed(() => {
  const name = maxHitName.value
  const value = maxHitValue.value
  if (!name || name === '---' || !value || value === '---') return name || value || ''
  return `${name} ${value}`
})

const tokens = computed(() => ({
  name: displayName.value,
  job:  props.bar.job,
  rank: `#${props.bar.rank}`,
  icon: getJobIconSrc(props.bar.job),
  value: props.bar.displayValue,
  pct:   `${props.bar.displayPct}%`,
  'crithit%': `${props.bar.crithit}%`,
  'directhit%': `${props.bar.directhit}%`,
  enchps: props.bar.enchps,
  maxHit: maxHit.value,
  maxHitName: maxHitName.value,
  maxHitValue: maxHitValue.value,
}))

function fieldText(template: string): string {
  return renderTemplate(template.replace('{icon}', '').trim(), tokens.value)
}
</script>

<template>
  <div v-if="isValid" :style="wrapperStyle">
    <!-- Shadow (z:0) — directional clip prevents opposite-direction bleed -->
    <div :style="bgShadowDirectionalClip">
      <div :style="bgShadowStyle">
        <div v-if="isClipped" :style="bgShadowSourceStyle" />
      </div>
    </div>
    <!-- Bg (z:1) -->
    <div :style="shapeLayerStyle">
      <div :style="bgStyle">
        <div v-if="bgTextureInnerStyle" :style="bgTextureInnerStyle" />
      </div>
    </div>
    <!-- Fill layer (z:1) -->
    <div :style="fillShadowBoundsStyle">
      <div :style="fillShadowWrapStyle">
        <div :style="fillStyle">
          <div v-if="fillTextureInnerStyle" :style="fillTextureInnerStyle" />
        </div>
      </div>
    </div>

    <!-- Icon on separate row above the bar -->
    <template v-if="showIcon && iconConfig.separateRow">
      <div class="icon-row" :style="{ justifyContent: 'center', padding: '2px 0', ...iconContainerStyle }">
        <template v-if="iconConfig.bgShape.enabled">
          <div class="icon-bg-wrap" :style="[iconBgStyle, iconBgDiamondStyle, iconBgOutlineStyle]" />
          <img
            :src="iconSrc"
            :width="iconSize"
            :height="iconSize"
            :alt="bar.job"
            :style="iconImageStyle"
            @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }"
          />
        </template>
        <img
          v-else
          :src="iconSrc"
          :width="iconSize"
          :height="iconSize"
          :alt="bar.job"
          :style="{ ...iconImageStyle, ...iconOutlineStyle }"
          @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }"
        />
      </div>
    </template>

    <!-- Icon inline — standalone absolutely positioned (not separateRow) -->
    <template v-if="showIcon && !iconConfig.separateRow">
      <div :style="iconInlineStyle">
        <template v-if="iconConfig.bgShape.enabled">
          <div class="icon-bg-wrap" :style="[iconBgStyle, iconBgDiamondStyle, iconBgOutlineStyle]" />
          <img :src="iconSrc" :width="iconSize" :height="iconSize" :alt="bar.job"
            :style="{ position:'relative', zIndex:1, ...iconImageStyle }"
            @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }" />
        </template>
        <img v-else :src="iconSrc" :width="iconSize" :height="iconSize" :alt="bar.job"
          :style="{ display:'block', ...iconImageStyle, ...iconOutlineStyle }"
          @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }" />
      </div>
    </template>

    <!-- Label: independently positioned text fields -->
    <div :style="labelStyle">
      <template v-for="field in processedFields" :key="field.id">
        <div :style="field.style">
          <span v-if="labelOutlineShadow" :style="{ position:'absolute', inset:0, color:'transparent', textShadow:labelOutlineShadow, overflow:'visible', whiteSpace:'nowrap', pointerEvents:'none' }">{{ fieldText(field.template) }}</span>
          <span :style="{ overflow:'hidden', textOverflow:'ellipsis', minWidth:0, filter: textStyle, ...(field.template.includes('{name}') ? blurStyle : undefined), ...gradientTextStyle }">{{ fieldText(field.template) }}</span>
        </div>
      </template>
    </div>

    <!-- Death indicator -->
    <span v-if="showDeath" :style="deathStyle">{{ deathText }}</span>
  </div>
</template>

<style scoped>
.icon-row {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  z-index: 2;
}
.icon-bg-wrap {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
