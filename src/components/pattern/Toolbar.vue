<script setup lang="ts">
import { computed } from 'vue'
import { usePatternStore } from '@/stores/pattern'

const emit = defineEmits<{ (e: 'viewOrig'): void; (e: 'export'): void; (e: 'pick'): void }>()

const store = usePatternStore()

const SIZES = [29, 50, 80, 100]
const SIZE_MIN = 50
const SIZE_MAX = 200

// 显示 cols × rows（拼豆板的格子数，符合实际拼豆尺寸表达）
const sizeDisplay = computed(() => {
  const aspect = store.imgAspect
  if (!aspect || aspect === 1) return `${store.size}×${store.size}`
  const long = store.size
  const short = Math.max(1, Math.round(long * Math.min(aspect, 1 / aspect)))
  return aspect >= 1 ? `${long}×${short}` : `${short}×${long}`
})

// ghost 态：已恢复历史图纸但原图未存（srcData=null），调参/原图需重传图
const ghost = computed(() => !store.srcData && store.hexGrid.length > 0)
</script>

<template>
  <view class="toolbar">
    <view class="mode-toggle">
      <view
        class="mode-btn"
        :class="{ active: store.mode === 'view' }"
        @tap="store.setMode('view')"
      >图纸</view>
      <view
        class="mode-btn"
        :class="{ active: store.mode === 'track' }"
        @tap="store.setMode('track')"
      >进度</view>
    </view>

    <view class="tool-label">尺寸</view>
    <view class="zoom-row">
      <view class="zoom-btn" @tap="store.setSize(Math.max(SIZE_MIN, store.size - 5))">−</view>
      <slider
        class="zoom-slider"
        :min="SIZE_MIN"
        :max="SIZE_MAX"
        :step="1"
        :value="store.size"
        activeColor="#F77F00"
        backgroundColor="#F3EAD6"
        block-size="18"
        @change="(e: any) => store.setSize(e.detail.value)"
      />
      <view class="zoom-btn" @tap="store.setSize(Math.min(SIZE_MAX, store.size + 5))">+</view>
      <view class="zoom-pct">{{ sizeDisplay }}</view>
    </view>

    <view class="tool-label">缩放</view>
    <view class="zoom-row">
      <view class="zoom-btn" @tap="store.setZoom(Math.max(0.5, +(store.zoom - 0.1).toFixed(2)))">−</view>
      <slider
        class="zoom-slider"
        :min="0.5"
        :max="2.6"
        :step="0.1"
        :value="store.zoom"
        activeColor="#F77F00"
        backgroundColor="#F3EAD6"
        block-size="18"
        @change="(e: any) => store.setZoom(e.detail.value)"
      />
      <view class="zoom-btn" @tap="store.setZoom(Math.min(2.6, +(store.zoom + 0.1).toFixed(2)))">+</view>
      <view class="zoom-pct">{{ Math.round(store.zoom * 100) }}%</view>
    </view>

    <view class="tool-label" v-if="store.srcData">颜色合并</view>
    <view class="merge-block" v-if="store.srcData">
      <view class="seg">
        <view class="seg-btn" :class="{ active: !store.mergeEnabled }" @tap="store.setMergeEnabled(false)">关</view>
        <view class="seg-btn" :class="{ active: store.mergeEnabled }" @tap="store.setMergeEnabled(true)">开</view>
      </view>
      <template v-if="store.mergeEnabled">
        <view class="seg">
          <view class="seg-btn" :class="{ active: store.mergeMode === 'spatial' }" @tap="store.setMergeMode('spatial')">边界</view>
          <view class="seg-btn" :class="{ active: store.mergeMode === 'palette' }" @tap="store.setMergeMode('palette')">色号</view>
        </view>
        <view class="tool-label" v-if="store.mergeMode === 'spatial'">阈值 {{ store.spatialThreshold }}</view>
        <slider
          v-if="store.mergeMode === 'spatial'"
          class="merge-slider"
          :min="5"
          :max="20"
          :step="1"
          :value="store.spatialThreshold"
          activeColor="#F77F00"
          backgroundColor="#F3EAD6"
          block-size="18"
          @change="(e: any) => store.setSpatialThreshold(e.detail.value)"
        />
        <template v-else>
          <view class="tool-label">色数 {{ store.paletteMaxColors === 0 ? '不限' : store.paletteMaxColors }}</view>
          <slider
            class="merge-slider"
            :min="0"
            :max="40"
            :step="1"
            :value="store.paletteMaxColors"
            activeColor="#F77F00"
            backgroundColor="#F3EAD6"
            block-size="18"
            @change="(e: any) => store.setPaletteMaxColors(e.detail.value)"
          />
          <view class="tool-label">最少 {{ store.paletteMinCount }} 颗</view>
          <slider
            class="merge-slider"
            :min="1"
            :max="10"
            :step="1"
            :value="store.paletteMinCount"
            activeColor="#F77F00"
            backgroundColor="#F3EAD6"
            block-size="18"
            @change="(e: any) => store.setPaletteMinCount(e.detail.value)"
          />
        </template>
      </template>
    </view>

    <view class="actions">
      <view class="btn ghost" @tap="emit('viewOrig')" v-if="store.origTempFilePath">
        <text>原图</text>
      </view>
      <view class="btn" @tap="emit('export')" v-if="store.hexGrid.length > 0">
        <text>导出 PNG</text>
      </view>
    </view>

    <view class="btn pick" @tap="emit('pick')">
      <text>{{ store.srcData ? '换图片' : (ghost ? '重新上传图' : '选择图片') }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12rpx 0 16rpx;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: $orange;
  color: #fff;
  border: $border;
  border-radius: 11px;
  padding: 8px 14px;
  font-weight: 600;
  font-size: 14px;
  box-shadow: $shadow-sm;
  &.pick { background: $teal; }
  &.ghost { background: $surface; color: $ink; }
}
.mode-toggle, .seg {
  display: inline-flex;
  border: $border;
  border-radius: 12px;
  overflow: hidden;
  background: $bg-2;
  box-shadow: $shadow-sm;
}
.mode-toggle, .seg { width: 100%; }
.mode-btn, .seg-btn {
  font-weight: 600;
  font-size: 14px;
  padding: 8px 13px;
  border-right: $border;
  background: transparent;
  color: $ink;
  &:last-child { border-right: 0; }
}
.mode-btn, .seg-btn { flex: 1 1 0; text-align: center; justify-content: center; }
.mode-btn.active { background: $orange; color: #fff; }
.seg-btn.active { background: $ink; color: #fff; }
.tool-label {
  font-weight: 800;
  font-size: 12.5px;
  color: $ink-soft;
  margin-right: 2px;
}
.ghost-hint {
  color: $orange;
  font-weight: 700;
}
.zoom-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.zoom-slider {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
}
.zoom-btn {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: $surface;
  border: $border;
  border-radius: 8px;
  box-shadow: $shadow-sm;
  font-weight: 700;
  font-size: 16px;
  color: $ink;
  cursor: pointer;
  user-select: none;
}
.zoom-pct {
  flex: 0 0 auto;
  min-width: 38px;
  text-align: right;
  font-weight: 700;
  font-size: 12.5px;
  color: $ink;
  font-variant-numeric: tabular-nums;
}
.merge-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.merge-slider {
  width: 100%;
  margin: 0;
}
.spacer { flex: 1; }
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
