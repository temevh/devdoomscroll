<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ id: string; name: string }>()

const COLORS: Record<string, string> = {
  devto: 'bg-ink text-canvas',
  reddit: 'bg-[#ff7a59] text-canvas',
  stackoverflow: 'bg-[#f4b23e] text-canvas',
  hackernews: 'bg-[#8fb4ff] text-canvas',
  lobsters: 'bg-[#f2a0a0] text-canvas',
  github: 'bg-[#b79cff] text-canvas',
}

const color = computed(() => COLORS[props.id] ?? 'bg-line text-ink')
</script>

<template>
  <span
    class="inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-[11px] font-bold"
    :class="color"
    aria-hidden="true"
  >
    {{ name.charAt(0).toUpperCase() }}
  </span>
</template>
