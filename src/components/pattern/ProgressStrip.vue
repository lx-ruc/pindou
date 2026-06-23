<script setup lang="ts">
import { computed } from 'vue'
import { usePatternStore } from '@/stores/pattern'
import { BRAND_CODES } from '@/utils/palette'
import { zoneLabel } from '@/utils/route'

const store = usePatternStore()

const prog = computed(() => store.progress)
const nextInfo = computed(() => {
  const n = prog.value.next
  if (!n) return null
  const [r, c] = n
  const hex = store.hexGrid[r][c]
  return {
    zone: zoneLabel(r, c),
    code: BRAND_CODES[store.brand][hex],
    hex,
  }
})
</script>

<template>
  <view class="progress-strip" v-if="store.mode === 'track' && store.srcData">
    <view class="prog-text">
      已拼 <text class="num">{{ prog.placed }}</text> / {{ prog.total }} · {{ prog.pct }}%
    </view>
    <view class="prog-bar">
      <view class="prog-fill" :style="{ width: prog.pct + '%' }" />
    </view>
    <view class="prog-next" v-if="nextInfo">
      <text>下一步</text>
      <view class="prog-chip">
        <view class="mini-swatch" :style="{ background: nextInfo.hex }" />
        <text>{{ nextInfo.zone }} · {{ nextInfo.code }}</text>
      </view>
    </view>
    <view class="prog-next" v-else>
      <view class="prog-chip done">全部完成</view>
    </view>
    <view class="guide" @tap="store.toggleGuide()">
      <view class="checkbox" :class="{ checked: store.guide }" />
      <text>引导顺序</text>
    </view>
    <view class="reset-btn" @tap="store.resetPlaced()">重置</view>
  </view>
</template>

<style lang="scss" scoped>
.progress-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
  padding: 8rpx 0;
}
.prog-text {
  font-weight: 700;
  font-size: 15px;
  white-space: nowrap;
  .num {
    color: $orange;
    font-size: 24px;
    font-weight: 700;
  }
}
.prog-bar {
  flex: 1;
  min-width: 140px;
  height: 22px;
  background: $bg-2;
  border: $border;
  border-radius: 11px;
  overflow: hidden;
  box-shadow: $shadow-sm;
}
.prog-fill {
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, $orange, $orange-light);
  transition: width 0.25s;
}
.prog-next {
  font-weight: 700;
  font-size: 12.5px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.prog-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: $ink;
  color: #fff;
  border-radius: 9px;
  padding: 5px 11px;
  animation: pulse 1.4s ease-in-out infinite;
  &.done { animation: none; }
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(247, 127, 0, 0.5); }
  50% { box-shadow: 0 0 0 6px rgba(247, 127, 0, 0); }
}
.mini-swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1.5px solid #fff;
}
.guide {
  font-weight: 700;
  font-size: 12.5px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid $ink;
  border-radius: 4px;
  background: $surface;
  position: relative;
  &.checked {
    background: $orange;
    &::after {
      content: '';
      position: absolute;
      left: 4px;
      top: 1px;
      width: 4px;
      height: 8px;
      border: solid #fff;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
  }
}
.reset-btn {
  font-weight: 600;
  font-size: 13px;
  padding: 7px 12px;
  background: $surface;
  color: $ink;
  border: $border;
  border-radius: 11px;
  box-shadow: $shadow-sm;
}
</style>
