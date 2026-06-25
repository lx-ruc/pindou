<script setup lang="ts">
import { usePatternStore } from '@/stores/pattern'
import { BRAND_CODES } from '@/utils/palette'

const store = usePatternStore()
</script>

<template>
  <view class="panel">
    <view class="card display-card" v-if="store.mode === 'view'">
      <view class="group-title">显示</view>
      <view class="opt-row">
        <view class="opt" :class="{ on: store.showZones }" @tap="store.toggleZones()">
          <text>分区</text>
        </view>
        <view class="opt" :class="{ on: store.showCodes }" @tap="store.toggleCodes()">
          <text>色号</text>
        </view>
      </view>
    </view>

    <view class="card stats-card">
      <view class="group-title">统计</view>
      <view class="stat-row">
        <view class="stat">
          <view class="n">{{ store.totalBeads }}</view>
          <view class="l">总豆数</view>
        </view>
        <view class="stat">
          <view class="n">{{ store.sortedItems.length }}</view>
          <view class="l">颜色</view>
        </view>
      </view>
    </view>

  </view>
</template>

<style lang="scss" scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.card {
  background: $surface;
  border: $border;
  border-radius: $radius;
  box-shadow: $shadow;
  padding: 14px;
  width: 100%;
  box-sizing: border-box;
}
.display-card, .stats-card { min-width: 0; }
.legend-card {
  flex: 1 1 300px;
  min-width: 240px;
}
.group-title {
  font-size: 13px;
  font-weight: 600;
  color: $ink-soft;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin: 0 0 9px;
  text-align: center;
}
.opt-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.opt {
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 12px;
  border: $border;
  border-radius: 11px;
  background: $surface;
  box-shadow: $shadow-sm;
  &.on {
    background: $ink;
    color: #fff;
  }
}
.stat-row {
  display: flex;
  gap: 18px;
  justify-content: center;
}
.stat {
  text-align: center;
  .n {
    font-size: 26px;
    font-weight: 700;
    color: $orange;
    line-height: 1;
  }
  .l {
    font-size: 11px;
    font-weight: 700;
    color: $ink-soft;
    margin-top: 3px;
  }
}
.legend-scroll {
  max-height: 140px;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding-right: 4px;
}
.bead-row {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 9px;
  border: 2px solid $ink;
  border-radius: 9px;
  background: $surface;
  box-shadow: $shadow-xs;
}
.bead-swatch {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: 2px solid $ink;
}
.bead-code {
  font-weight: 700;
  font-size: 14px;
}
.bead-count {
  font-weight: 700;
  font-size: 13px;
  color: $ink-soft;
}
</style>
