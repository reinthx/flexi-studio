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

const emit = defineEmits<{ click: [] }>()

const props = defineProps<{
  bar: BarData
  styleConfig: BarStyle
  orientation: Orientation
  showRank: boolean
  blurName?: boolean
  valueFormat?: 'raw' | 'abbreviated' | 'formatted'
  barIndex?: number
  tabLabelConfig?: BarLabel
  rank1Config?: { rank1HeightIncrease?: number; rank1Glow?: { enabled: boolean; color: string; blur: number }; rank1ShowCrown?: boolean; rank1Crown?: { enabled: boolean; icon: string; imageUrl?: string; size: number; offsetX: number; offsetY: number; rotation?: number; hAnchor: 'left' | 'right' | 'center'; vAnchor: 'top' | 'middle' | 'bottom' }; rank1NameStyle?: { enabled: boolean; gradient?: { type: 'linear' | 'radial'; angle: number; stops: Array<{ color: string; position: number }> } }; rank1IconStyle?: { enabled: boolean; glow?: { enabled: boolean; color: string; blur: number }; shadow?: { enabled: boolean; color: string; blur: number }; bgShape?: { enabled: boolean; shape: 'circle' | 'square' | 'rounded' | 'diamond'; color: string; size: number; opacity: number; offsetX: number; offsetY: number } } }
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
  rank1HeightAdjustment, rank1ZIndex, rank1GlowStyle, rank1ShowCrown, rank1CrownStyle, rank1CrownIcon, rank1CrownIsImage, rank1NameGradientStyle, isRank1,
} = useBarStyles(() => props.bar, () => props.styleConfig, () => props.orientation, () => props.barIndex ?? 0, () => props.tabLabelConfig, () => props.rank1Config, undefined, () => props.barWidth)

const isValid = computed(() => {
  const sc = props.styleConfig
  return sc && sc.label && sc.shape && sc.fill && sc.bg
})

const wrapperStyle = computed(() => {
  if (!isValid.value) return { display: 'none' }
  const baseHeight = parseFloat(String(dims.value.height)) || 28
  const adjustedHeight = baseHeight + rank1HeightAdjustment.value
  return {
    height: `${adjustedHeight}px`,
    width: dims.value.width,
    marginBottom: dims.value.marginBottom,
    marginRight: dims.value.marginRight,
    opacity: String(props.bar.alpha),
    position: 'relative' as const,
    overflow: 'visible' as const,
    zIndex: rank1ZIndex.value,
    ...(rank1GlowStyle.value ? rank1GlowStyle.value : {}),
    ...(shapeCss.value.borderRadius ? { borderRadius: shapeCss.value.borderRadius } : {}),
  }
})

// â”€â”€ Blur names â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const displayName = computed(() => {
  // if (props.blurName && MOCK_NAMES.length > 0) {
  //   return MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)]
  // }
  return props.bar.name
})

const blurStyle = computed(() => {
  if (props.blurName) {
    return { fontFamily: "'redacted-script-bold'", filter: 'blur(1px)', opacity: '0.85', userSelect: 'none' as const, letterSpacing: '-0.06em', fontSize: '1.15em', lineHeight: '1.15', transform: 'translateY(-3px)' }
  }
  return undefined
})

// â”€â”€ Tokens / labels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  <div v-if="isValid" :style="wrapperStyle" @click="emit('click')" style="cursor:pointer">
    <!-- Shadow (z:0) â€” directional clip prevents opposite-direction bleed -->
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

    <!-- Icon inline â€” standalone absolutely positioned (not separateRow) -->
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

    <!-- Rank 1 crown -->
    <img v-if="rank1ShowCrown && rank1CrownIsImage" :src="rank1CrownIcon" :style="rank1CrownStyle" alt="crown" />
    <div v-else-if="rank1ShowCrown" :style="rank1CrownStyle">{{ rank1CrownIcon }}</div>
    <!-- Label: independently positioned text fields -->
    <div :style="labelStyle">
      <template v-for="field in processedFields" :key="field.id">
        <div :style="[field.style, blurStyle ? { maxWidth: 'none' } : {}]">
          <span v-if="labelOutlineShadow" :style="{
            position:'absolute', inset:0,
            color:'transparent',
            textShadow: labelOutlineShadow,
            overflow:'visible', whiteSpace:'nowrap',
            pointerEvents:'none',
            ...(field.template.includes('{name}') ? blurStyle : undefined)
          }">{{ fieldText(field.template) }}</span>
          <span :style="{
            minWidth: 0,
            overflow:'hidden', textOverflow:'ellipsis',
            whiteSpace:'nowrap',
            filter: textStyle,
            ...(field.template.includes('{name}') && isRank1 ? { ...gradientTextStyle, ...rank1NameGradientStyle } : {
              ...gradientTextStyle,
              background: field.gradientStyle,
              backgroundClip: field.gradientStyle ? 'text' : undefined,
              WebkitBackgroundClip: field.gradientStyle ? 'text' : undefined,
              WebkitTextFillColor: field.gradientStyle ? 'transparent' : undefined,
            }),
            ...(field.template.includes('{name}') ? blurStyle : undefined)
          }">{{ fieldText(field.template) }}</span>
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
