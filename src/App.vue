<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  console.log('拼豆智能助手 App Launch')
})
</script>

<style lang="scss">
@import './uni.scss';

page {
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica,
    'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
  background-color: $bg-color;
  color: $ink;
  font-size: 28rpx;
  line-height: 1.6;
}
</style>
