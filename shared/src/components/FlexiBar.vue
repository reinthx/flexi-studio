<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ValueFormat } from '../configSchema'
import { formatValue } from '../formatValue'
import { getJobIconSrc } from '../jobMap'
import { renderTemplate } from '../templateRenderer'
import { useBarStyles } from '../useBarStyles'
import { buildFlexiBarTokens } from '../barRenderer'
import type { FlexiBarProps } from '../barRenderer'

const emit = defineEmits<{ click: [] }>()
const props = defineProps<FlexiBarProps>()

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
  iconConfig, iconSrc: defaultIconSrc, showIcon, iconSize,
  iconContainerStyle, iconInlineStyle, iconImageStyle,
  iconBgOutlineStyle, iconBgStyle, iconBgDiamondStyle,
  iconFallback,
  rank1HeightAdjustment, rank1ZIndex, rank1GlowStyle, rank1ShowCrown, rank1CrownStyle, rank1CrownIcon, rank1CrownIsImage, rank1NameGradientStyle, isRank1,
} = useBarStyles(() => props.bar, () => props.styleConfig, () => props.orientation, () => props.barIndex ?? 0, () => props.tabLabelConfig, () => props.rank1Config, () => props.colorOverrides, () => barWidth.value)

const isHorizontal = computed(() => props.orientation === 'horizontal')

const isValid = computed(() => {
  if (!props.validateStyle) return true
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
    cursor: props.clickable ? 'pointer' : undefined,
    ...(rank1GlowStyle.value ? rank1GlowStyle.value : {}),
    ...(shapeCss.value.borderRadius ? { borderRadius: shapeCss.value.borderRadius } : {}),
  }
})

const iconSrc = computed(() => {
  const custom = props.bar.job && (props.styleConfig as any)._customIcons?.[props.bar.job]
  return custom || defaultIconSrc.value || getJobIconSrc(props.bar.job)
})

const blurStyle = computed(() => {
  if (!props.blurName) return undefined
  return { fontFamily: "'redacted-script-bold'", filter: 'blur(1px)', opacity: '0.85', userSelect: 'none' as const, letterSpacing: '-0.06em', fontSize: '1.15em', lineHeight: '1.15', transform: 'translateY(-3px)' }
})

const tokens = computed(() => buildFlexiBarTokens(props.bar, props.showRank, props.valueFormat ?? 'abbreviated'))

function fieldText(field: { template: string; valueFormat?: string }): string {
  const tpl = field.template.replace('{icon}', '').trim()
  const fmt = field.valueFormat as ValueFormat
  if (fmt && fmt !== props.valueFormat) {
    const nextTokens = { ...tokens.value }
    nextTokens.value = formatValue(props.bar.rawValue ?? 0, fmt)
    nextTokens.enchps = formatValue(props.bar.rawEnchps ?? 0, fmt)
    nextTokens.rdps = formatValue(props.bar.rawRdps ?? 0, fmt)
    return renderTemplate(tpl, nextTokens)
  }
  return renderTemplate(tpl, tokens.value)
}

function handleClick() {
  if (props.clickable) emit('click')
}
</script>

<template>
  <div v-if="isValid" ref="barEl" :style="wrapperStyle" @click="handleClick">
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
            <template v-if="expandedShadowFilter">
              <feGaussianBlur
                in="SourceAlpha"
                :stdDeviation="bgShadowSvgDropShadowAttrs.stdDeviation"
                result="bg-shadow-blur"
              />
              <feOffset
                in="bg-shadow-blur"
                :dx="bgShadowSvgDropShadowAttrs.dx"
                :dy="bgShadowSvgDropShadowAttrs.dy"
                result="bg-shadow-offset"
              />
              <feFlood
                :flood-color="bgShadowSvgDropShadowAttrs.floodColor"
                result="bg-shadow-color"
              />
              <feComposite
                in="bg-shadow-color"
                in2="bg-shadow-offset"
                operator="in"
              />
            </template>
            <feDropShadow v-else v-bind="bgShadowSvgDropShadowAttrs" />
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

    <template v-if="showIcon && !iconConfig.separateRow">
      <div :style="iconInlineStyle">
        <template v-if="iconConfig.bgShape.enabled">
          <div class="icon-bg-wrap" :style="[iconBgStyle, iconBgDiamondStyle, iconBgOutlineStyle]" />
          <img
            :src="iconSrc"
            :width="iconSize"
            :height="iconSize"
            :alt="bar.job"
            :style="{ position: 'relative', zIndex: 1, ...iconImageStyle }"
            @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }"
          />
        </template>
        <img
          v-else
          :src="iconSrc"
          :width="iconSize"
          :height="iconSize"
          :alt="bar.job"
          :style="{ display: 'block', ...iconImageStyle }"
          @error="(e) => { (e.target as HTMLImageElement).src = iconFallback }"
        />
      </div>
    </template>

    <img v-if="rank1ShowCrown && rank1CrownIsImage" :src="rank1CrownIcon" :style="rank1CrownStyle" alt="crown" />
    <div v-else-if="rank1ShowCrown" :style="rank1CrownStyle">{{ rank1CrownIcon }}</div>
    <div :style="labelStyle">
      <template v-for="field in processedFields" :key="field.id">
        <div :style="[field.style, blurStyle ? { maxWidth: 'none' } : {}]">
          <span
            v-if="labelOutlineShadow"
            :style="{
              position: 'absolute',
              inset: 0,
              display: 'block',
              color: 'transparent',
              textShadow: labelOutlineShadow,
              overflow: 'visible',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              pointerEvents: 'none',
              ...(field.template.includes('{name}') ? blurStyle : undefined),
            }"
          >{{ fieldText(field) }}</span>
          <span
            :style="{
              display: 'block',
              minWidth: 0,
              maxWidth: '100%',
              overflow: 'visible',
              whiteSpace: 'nowrap',
              filter: textStyle,
              ...(field.template.includes('{name}') && isRank1 ? { ...gradientTextStyle, ...rank1NameGradientStyle } : {
                ...gradientTextStyle,
                background: field.gradientStyle,
                backgroundClip: field.gradientStyle ? 'text' : undefined,
                WebkitBackgroundClip: field.gradientStyle ? 'text' : undefined,
                WebkitTextFillColor: field.gradientStyle ? 'transparent' : undefined,
              }),
              ...(field.template.includes('{name}') ? blurStyle : undefined),
            }"
          >{{ fieldText(field) }}</span>
        </div>
      </template>
    </div>

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
