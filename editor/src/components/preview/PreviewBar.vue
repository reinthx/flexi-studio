<script setup lang="ts">
import { computed } from 'vue'
import type { BarStyle, Orientation } from '@shared/configSchema'
import { renderTemplate } from '../../lib/templateRenderer'
import { getJobIconSrc } from '@shared/jobMap'
import { useBarStyles, type BarData } from '@shared/useBarStyles'

const props = defineProps<{
  bar: BarData
  styleConfig: BarStyle
  orientation: Orientation
  showRank: boolean
  containerHeight?: number
  autoScale?: boolean
  barIndex?: number
}>()

const {
  shapeCss, isClipped, dims,
  outlineTarget, outlineCss,
  shapeLayerStyle,
  bgShadowDirectionalClip, bgShadowStyle, bgShadowSourceStyle,
  bgStyle, bgTextureInnerStyle,
  fillShadowBoundsStyle, fillShadowWrapStyle, fillStyle, fillTextureInnerStyle,
  label, labelStyle, processedFields, textStyle, gradientTextStyle,
  showDeath, deathText, deathStyle,
  iconConfig, showIcon, iconSize,
  iconContainerStyle, iconInlineStyle, iconImageStyle,
  iconOutlineStyle, iconBgOutlineStyle, iconBgStyle, iconBgDiamondStyle,
  iconFallback,
} = useBarStyles(() => props.bar, () => props.styleConfig, () => props.orientation, () => props.barIndex ?? 0)

// ── Wrapper (editor-specific: flex sizing, outline on wrapper) ──────────────
const wrapperStyle = computed(() => ({
  height: dims.value.height,
  width: dims.value.width,
  marginBottom: dims.value.marginBottom,
  marginRight: dims.value.marginRight,
  flex: dims.value.flex ?? '0 0 auto',
  opacity: String(props.bar.alpha),
  position: 'relative' as const,
  overflow: 'visible' as const,
  flexShrink: 0,
  ...(shapeCss.value.borderRadius ? { borderRadius: shapeCss.value.borderRadius } : {}),
  ...((outlineTarget.value === 'bg' || outlineTarget.value === 'both') ? outlineCss.value : {}),
}))

// ── Icon source (supports custom icons in editor) ───────────────────────────
const iconSrc = computed(() => {
  const custom = props.bar.job && (props.styleConfig as any)._customIcons?.[props.bar.job]
  return custom || getJobIconSrc(props.bar.job)
})

const separateRow = computed(() => iconConfig.value.separateRow ?? false)

const tokens = computed(() => ({
  name: props.bar.name,
  job:  props.bar.job,
  rank: props.showRank ? `#${props.bar.rank}` : '',
  value: props.bar.displayValue,
  pct:  `${props.bar.displayPct}%`,
  'crithit%': `${props.bar.crithit}%`,
  'directhit%': `${props.bar.directhit}%`,
  enchps: props.bar.enchps,
}))
</script>

<template>
  <!-- Outer: size/opacity/overflow — no clip-path so label is never cut -->
  <div :style="wrapperStyle">
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
    <template v-if="showIcon && separateRow">
      <div class="icon-row" :style="{ justifyContent: 'center', padding: '2px 0', ...iconContainerStyle }">
        <template v-if="iconConfig.bgShape.enabled">
          <div class="icon-bg-wrap" :style="[iconBgStyle, iconBgDiamondStyle, iconBgOutlineStyle]" />
          <img
            :src="iconSrc"
            :width="iconSize"
            :height="iconSize"
            :alt="props.bar.job"
            :style="iconImageStyle"
            @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }"
          />
        </template>
        <img
          v-else
          :src="iconSrc"
          :width="iconSize"
          :height="iconSize"
          :alt="props.bar.job"
          :style="{ ...iconImageStyle, ...iconOutlineStyle }"
          @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }"
        />
      </div>
    </template>

    <!-- Icon inline — standalone absolutely positioned (not separateRow) -->
    <template v-if="showIcon && !separateRow">
      <div :style="iconInlineStyle">
        <template v-if="iconConfig.bgShape.enabled">
          <div class="icon-bg-wrap" :style="[iconBgStyle, iconBgDiamondStyle, iconBgOutlineStyle]" />
          <img :src="iconSrc" :width="iconSize" :height="iconSize" :alt="props.bar.job"
            :style="{ position:'relative', zIndex:1, ...iconImageStyle }"
            @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }" />
        </template>
        <img v-else :src="iconSrc" :width="iconSize" :height="iconSize" :alt="props.bar.job"
          :style="{ display:'block', ...iconImageStyle, ...iconOutlineStyle }"
          @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }" />
      </div>
    </template>

    <!-- Label: independently positioned text fields -->
    <div :style="labelStyle">
      <template v-for="field in processedFields" :key="field.id">
        <div :style="field.style">
          <span :style="{ overflow:'hidden', textOverflow:'ellipsis', minWidth:0, filter:textStyle, ...gradientTextStyle }">
            {{ renderTemplate(field.template, tokens) }}
          </span>
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
