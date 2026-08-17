<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ data: number[] }>()

const points = computed(() => {
  const d = props.data.slice(-24)
  if (d.length < 2) return ''
  const w = 100
  const h = 24
  const max = Math.max(...d, 1)
  const min = Math.min(...d, 0)
  const range = max - min || 1
  return d
    .map((v, i) => `${((i / (d.length - 1)) * w).toFixed(1)},${(h - 1 - ((v - min) / range) * (h - 3)).toFixed(1)}`)
    .join(' ')
})
</script>

<template>
  <svg viewBox="0 0 100 24" preserveAspectRatio="none" class="h-6 w-full">
    <polyline :points="points" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  </svg>
</template>
