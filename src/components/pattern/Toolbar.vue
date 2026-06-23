<script setup lang="ts">
import { usePatternStore } from '@/stores/pattern'
import { pickAndDecodeImage } from '@/composables/useImageDecode'

const emit = defineEmits<{ (e: 'picked'): void; (e: 'viewOrig'): void; (e: 'export'): void }>()

const store = usePatternStore()

const SIZES = [29, 50, 80, 100]

// 调试日志
;(globalThis as any).__pindouLogs = (globalThis as any).__pindouLogs || []
const _t0 = Date.now()
function _log(tag: string, ...args: any[]): void {
  const dt = ((Date.now() - _t0) / 1000).toFixed(2) + 's'
  const line = `[${dt}][${tag}] ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`
  ;(globalThis as any).__pindouLogs.push(line)
  console.log(line)
}

async function onPick(): Promise<void> {
  _log('toolbar', 'onPick called')
  try {
    const picked = await pickAndDecodeImage()
    _log('toolbar', 'pickAndDecodeImage returned', picked ? `${picked.pixels.width}×${picked.pixels.height}` : 'null')
    if (picked) {
      store.ingest(picked)
      _log('toolbar', 'after ingest, srcData?', !!store.srcData, 'rows/cols', store.rows, store.cols)
      emit('picked')
    }
  } catch (e) {
    _log('toolbar', 'onPick FAILED', (e as Error)?.message || e)
    console.error('pick image failed', e)
    uni.showToast({ title: '图片加载失败', icon: 'none' })
  }
}
</script>

<template>
  <view class="toolbar">
    <view class="btn teal" @tap="onPick">
      <text>＋ 选择图片</text>
    </view>

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

    <view class="tool-label" v-if="store.mode === 'view'">尺寸</view>
    <view class="seg" v-if="store.mode === 'view'">
      <view
        v-for="s in SIZES"
        :key="s"
        class="seg-btn"
        :class="{ active: store.size === s }"
        @tap="store.setSize(s)"
      >{{ s }}</view>
    </view>

    <view class="tool-label">缩放</view>
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

    <view class="spacer" />

    <view class="actions" v-if="store.mode === 'view'">
      <view class="btn ghost" @tap="emit('viewOrig')" v-if="store.origTempFilePath">
        <text>原图</text>
      </view>
      <view class="btn" @tap="emit('export')" v-if="store.srcData">
        <text>导出 PNG</text>
      </view>
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
  &.teal { background: $teal; }
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
.mode-btn, .seg-btn {
  font-weight: 600;
  font-size: 14px;
  padding: 8px 13px;
  border-right: $border;
  background: transparent;
  color: $ink;
  &:last-child { border-right: 0; }
}
.mode-btn.active { background: $orange; color: #fff; }
.seg-btn.active { background: $ink; color: #fff; }
.tool-label {
  font-weight: 800;
  font-size: 12.5px;
  color: $ink-soft;
  margin-right: 2px;
}
.zoom-slider {
  width: 110px;
  margin: 0;
}
.spacer { flex: 1; }
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
