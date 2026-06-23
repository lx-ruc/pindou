<script setup lang="ts">
defineProps<{ show: boolean; src: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <view v-if="show" class="orig-pop" @tap="emit('close')">
    <view class="close-btn" @tap.stop="emit('close')">✕ 关闭</view>
    <image
      v-if="src"
      :src="src"
      mode="aspectFit"
      class="orig-img"
      @tap.stop
    />
  </view>
</template>

<style lang="scss" scoped>
.orig-pop {
  position: fixed;
  inset: 0;
  background: rgba(35, 32, 46, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 24px;
}
.close-btn {
  position: absolute;
  top: 18px;
  right: 22px;
  padding: 7px 14px;
  background: $surface;
  color: $ink;
  border: $border;
  border-radius: 11px;
  box-shadow: $shadow-sm;
  font-weight: 600;
  font-size: 13px;
}
.orig-img {
  max-width: 90vw;
  max-height: 80vh;
  border: $border;
  border-radius: 14px;
  box-shadow: $shadow;
}
</style>
