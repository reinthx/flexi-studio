<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { BarStyle, Orientation, BarLabel, StyleOverrides } from '@shared/configSchema'
import { useBarStyles } from '@shared/useBarStyles'
import type { BarData } from '@shared/useBarStyles'
import { renderTemplate } from '../lib/templateRenderer'
import { getJobIconSrc } from '@shared/jobMap'
import { formatValue } from '@shared/formatValue'
import type { ValueFormat } from '@shared/configSchema'

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
  colorOverrides?: StyleOverrides
}>()

const barEl = ref<HTMLElement | null>(null)
const barWidth = ref(0)
let barResizeObserver: ResizeObserver | null = null

function updateBarWidth() {
  barWidth.value = barEl.value?.getBoundingClientRect().width ?? 0
}

onMounted(() => {
  updateBarWidth()
  if (typeof ResizeObserver !== 'undefined' && barEl.value) {
    barResizeObserver = new ResizeObserver(updateBarWidth)
    barResizeObserver.observe(barEl.value)
  } else {
    window.addEventListener('resize', updateBarWidth)
  }
})

onUnmounted(() => {
  barResizeObserver?.disconnect()
  barResizeObserver = null
  window.removeEventListener('resize', updateBarWidth)
})

const {
  shapeCss, dims,
  shapeLayerStyle, shapeSvgLayerStyle, shapeSvgViewBox, shapeSvgPoints, shapeClipId,
  shapeSvgBgStyle, shapeSvgFillBox, shapeSvgFillStyle, shapeSvgStrokeStyle,
  bgShadowDirectionalClip, bgShadowStyle, bgShadowSourceStyle,
  bgShadowSvgStyle, bgShadowSvgFilterId, bgShadowSvgMaskId, bgShadowSvgFilterAttrs, bgShadowSvgDropShadowAttrs, bgShadowSvgMaskAttrs, bgShadowSvgMaskRectAttrs,
  bgStyle, bgTextureInnerStyle, bgStrokePoints, bgStrokeViewBox, bgStrokeSvgStyle, bgStrokeMaskStyle, bgStrokePolygonStyle,
  bgSegmentStrokePolygons,
  fillShadowBoundsStyle, fillShadowWrapStyle, fillStyle, fillTextureInnerStyle,
  metricStripBoundsStyle, metricStripClipStyle, metricStripShadowStyle, metricStripShadowSourceStyle, metricStripBgStyle, metricStripStyle, metricStripOutsideExtent, metricStripInlineExtent,
  labelStyle, labelOutlineShadow, processedFields, textStyle, gradientTextStyle,
  showDeath, deathText, deathStyle,
  iconConfig, iconSrc, showIcon, iconSize,
  iconContainerStyle, iconInlineStyle, iconImageStyle,
  iconBgOutlineStyle, iconBgStyle, iconBgDiamondStyle,
  iconFallback,
  rank1HeightAdjustment, rank1ZIndex, rank1GlowStyle, rank1ShowCrown, rank1CrownStyle, rank1CrownIcon, rank1CrownIsImage, rank1NameGradientStyle, isRank1,
} = useBarStyles(() => props.bar, () => props.styleConfig, () => props.orientation, () => props.barIndex ?? 0, () => props.tabLabelConfig, () => props.rank1Config, () => props.colorOverrides, () => barWidth.value)

const isHorizontal = computed(() => props.orientation === 'horizontal')

const isValid = computed(() => {
  const sc = props.styleConfig
  return sc && sc.label && sc.shape && sc.fill && sc.bg
})

const wrapperStyle = computed(() => {
  if (!isValid.value) return { display: 'none' }
  const baseHeight = parseFloat(String(dims.value.height)) || 28
  const adjustedHeight = baseHeight + rank1HeightAdjustment.value
  const baseWidth = parseFloat(String(dims.value.width)) || props.styleConfig.height
  const adjustedWidth = baseWidth + rank1HeightAdjustment.value
  return {
    height: isHorizontal.value ? dims.value.height : `${adjustedHeight}px`,
    width: isHorizontal.value ? `${adjustedWidth}px` : dims.value.width,
    marginTop: metricStripOutsideExtent.value.top ? `${metricStripOutsideExtent.value.top}px` : '0',
    marginBottom: `${(parseFloat(String(dims.value.marginBottom)) || 0) + metricStripOutsideExtent.value.bottom}px`,
    marginLeft: metricStripInlineExtent.value.left ? `${metricStripInlineExtent.value.left}px` : '0',
    marginRight: `${(parseFloat(String(dims.value.marginRight)) || 0) + metricStripInlineExtent.value.right}px`,
    flex: dims.value.flex ?? '0 0 auto',
    opacity: String(props.bar.alpha),
    position: 'relative' as const,
    overflow: 'visible' as const,
    flexShrink: 0,
    zIndex: rank1ZIndex.value,
    ...(rank1GlowStyle.value ? rank1GlowStyle.value : {}),
    ...(shapeCss.value.borderRadius ? { borderRadius: shapeCss.value.borderRadius } : {}),
  }
})

const displayName = computed(() => props.bar.name)

const blurStyle = computed(() => {
  if (props.blurName) {
    return { fontFamily: "'redacted-script-bold'", filter: 'blur(1px)', opacity: '0.85', userSelect: 'none' as const, letterSpacing: '-0.06em', fontSize: '1.15em', lineHeight: '1.15', transform: 'translateY(-3px)' }
  }
  return undefined
})

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
  const fmt: ValueFormat = props.valueFormat ?? 'abbreviated'
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
  rank: String(props.bar.rank),
  icon: getJobIconSrc(props.bar.job),
  value: props.bar.displayValue,
  pct:   `${props.bar.displayPct}%`,
  'crithit%': `${props.bar.crithit}%`,
  'directhit%': `${props.bar.directhit}%`,
  enchps: props.bar.enchps,
  rdps: props.bar.rdps,
  maxHit: maxHit.value,
  maxHitName: maxHitName.value,
  maxHitValue: maxHitValue.value,
}))

function fieldText(field: { template: string; valueFormat?: string }): string {
  const tpl = field.template.replace('{icon}', '').trim()
  if (!field.valueFormat) return renderTemplate(tpl, tokens.value)
  const fmt = field.valueFormat as ValueFormat
  return renderTemplate(tpl, {
    ...tokens.value,
    value: formatValue(props.bar.rawValue ?? parseFloat(props.bar.displayValue.replace(/,/g, '')) ?? 0, fmt),
    enchps: formatValue(props.bar.rawEnchps ?? parseFloat(props.bar.enchps.replace(/,/g, '')) ?? 0, fmt),
    rdps: formatValue(props.bar.rawRdps ?? parseFloat(props.bar.rdps.replace(/,/g, '')) ?? 0, fmt),
  })
}
</script>

<template>
  <div v-if="isValid" ref="barEl" :style="wrapperStyle" @click="emit('click')" style="cursor:pointer">
    <!-- Shadow (z:0) - directional clip prevents opposite-direction bleed -->
    <div :style="bgShadowDirectionalClip">
      <svg
        v-if="bgShadowSvgStyle && bgShadowSvgFilterAttrs && bgShadowSvgDropShadowAttrs && bgShadowSvgMaskAttrs"
        :style="bgShadowSvgStyle"
        :viewBox="shapeSvgViewBox"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <filter v-bind="bgShadowSvgFilterAttrs">
            <feDropShadow v-bind="bgShadowSvgDropShadowAttrs" />
          </filter>
          <mask v-bind="bgShadowSvgMaskAttrs">
            <rect v-bind="bgShadowSvgMaskRectAttrs" fill="white" />
            <polygon :points="shapeSvgPoints" fill="black" />
          </mask>
        </defs>
        <polygon
          :points="shapeSvgPoints"
          fill="#000"
          :filter="`url(#${bgShadowSvgFilterId})`"
          :mask="`url(#${bgShadowSvgMaskId})`"
        />
      </svg>
      <div v-else :style="bgShadowStyle">
        <div v-if="bgShadowSourceStyle" :style="bgShadowSourceStyle" />
      </div>
    </div>
    <!-- Bg (z:1) -->
    <div :style="shapeLayerStyle">
      <div :style="bgStyle">
        <div v-if="bgTextureInnerStyle" :style="bgTextureInnerStyle" />
      </div>
    </div>
    <svg
      v-if="shapeSvgLayerStyle"
      :style="shapeSvgLayerStyle"
      :viewBox="shapeSvgViewBox"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath :id="shapeClipId" clipPathUnits="userSpaceOnUse">
          <polygon :points="shapeSvgPoints" />
        </clipPath>
      </defs>
      <foreignObject
        v-if="shapeSvgBgStyle"
        :x="0"
        :y="0"
        :width="shapeSvgViewBox.split(' ')[2]"
        :height="shapeSvgViewBox.split(' ')[3]"
        :clip-path="`url(#${shapeClipId})`"
      >
        <div xmlns="http://www.w3.org/1999/xhtml" :style="shapeSvgBgStyle" />
      </foreignObject>
      <foreignObject
        v-if="shapeSvgFillBox && shapeSvgFillStyle"
        :x="shapeSvgFillBox.x"
        :y="shapeSvgFillBox.y"
        :width="shapeSvgFillBox.width"
        :height="shapeSvgFillBox.height"
        :clip-path="`url(#${shapeClipId})`"
      >
        <div xmlns="http://www.w3.org/1999/xhtml" :style="shapeSvgFillStyle" />
      </foreignObject>
      <polygon v-if="shapeSvgStrokeStyle" :points="shapeSvgPoints" :style="shapeSvgStrokeStyle" />
    </svg>
    <!-- Fill layer (z:1) -->
    <div :style="fillShadowBoundsStyle">
      <div :style="fillShadowWrapStyle">
        <div :style="fillStyle">
          <div v-if="fillTextureInnerStyle" :style="fillTextureInnerStyle" />
        </div>
      </div>
    </div>
    <div v-if="metricStripBoundsStyle && metricStripClipStyle && metricStripStyle" :style="metricStripBoundsStyle">
      <div v-if="metricStripShadowStyle" :style="metricStripShadowStyle">
        <div v-if="metricStripShadowSourceStyle" :style="metricStripShadowSourceStyle" />
      </div>
      <div :style="metricStripClipStyle">
        <div v-if="metricStripBgStyle" :style="metricStripBgStyle" />
        <div :style="metricStripStyle" />
      </div>
    </div>
    <svg
      v-if="bgStrokeSvgStyle && bgStrokePolygonStyle && (bgStrokePoints || bgSegmentStrokePolygons.length)"
      :style="bgStrokeSvgStyle"
      :viewBox="bgStrokeViewBox"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g v-if="bgStrokePoints" :style="bgStrokeMaskStyle">
        <polygon :points="bgStrokePoints" :style="bgStrokePolygonStyle" />
      </g>
      <polygon
        v-for="segment in bgSegmentStrokePolygons"
        :key="segment.key"
        :points="segment.points"
        :style="bgStrokePolygonStyle"
      />
    </svg>

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
          :style="iconImageStyle"
          @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }"
        />
      </div>
    </template>

    <!-- Icon inline - standalone absolutely positioned (not separateRow) -->
    <template v-if="showIcon && !iconConfig.separateRow">
      <div :style="iconInlineStyle">
        <template v-if="iconConfig.bgShape.enabled">
          <div class="icon-bg-wrap" :style="[iconBgStyle, iconBgDiamondStyle, iconBgOutlineStyle]" />
          <img :src="iconSrc" :width="iconSize" :height="iconSize" :alt="bar.job"
            :style="{ position:'relative', zIndex:1, ...iconImageStyle }"
            @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }" />
        </template>
        <img v-else :src="iconSrc" :width="iconSize" :height="iconSize" :alt="bar.job"
          :style="{ display:'block', ...iconImageStyle }"
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
            display:'block',
            color:'transparent',
            textShadow: labelOutlineShadow,
            overflow:'visible',
            whiteSpace:'nowrap',
            maxWidth:'100%',
            pointerEvents:'none',
            ...(field.template.includes('{name}') ? blurStyle : undefined)
          }">{{ fieldText(field) }}</span>
          <span :style="{
            display:'block',
            minWidth: 0,
            maxWidth:'100%',
            overflow:'visible',
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
          }">{{ fieldText(field) }}</span>
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
