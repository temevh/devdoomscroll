<script setup lang="ts">
import { computed } from 'vue'
import { sourceIcon } from '../../lib/sourceIcons.ts'

const props = defineProps<{ id: string; name: string }>()

const icon = computed(() => sourceIcon(props.id))
</script>

<template>
  <svg
    v-if="icon"
    class="size-5 shrink-0"
    viewBox="0 0 24 24"
    :style="{ fill: icon.color }"
    aria-hidden="true"
  >
    <path :d="icon.path" />
  </svg>
  <!-- No logo for this source yet: fall back to its first letter. -->
  <span
    v-else
    class="inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-line text-[11px] font-bold text-ink"
    aria-hidden="true"
  >
    {{ name.charAt(0).toUpperCase() }}
  </span>
</template>
