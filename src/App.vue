<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { usePatternStore } from '@/stores/pattern'
import { getKV } from '@/utils/storage'
import { SNAPSHOT_KEY, deserialize, applySnapshot } from '@/utils/persist'

onLaunch(() => {
  // 恢复上次会话的图纸 + 进度 + 参数（单项目，不存原图 → 进入 ghost 态）
  const store = usePatternStore()
  const raw = getKV(SNAPSHOT_KEY)
  if (!raw) return
  const snap = deserialize(raw)
  if (!snap) return
  applySnapshot(store, snap)
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
