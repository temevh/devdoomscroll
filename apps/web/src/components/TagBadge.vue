<script setup lang="ts">
withDefaults(
  defineProps<{
    name: string
    variant?: 'followed' | 'available'
  }>(),
  { variant: 'available' },
)

defineEmits<{ click: [name: string] }>()
</script>

<template>
  <button
    type="button"
    class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    :class="
      variant === 'followed'
        ? 'bg-accent text-canvas hover:bg-accent/85'
        : 'border border-dashed border-muted/40 text-ink hover:border-accent hover:text-accent'
    "
    :aria-label="variant === 'followed' ? `Unfollow ${name}` : `Follow ${name}`"
    @click="$emit('click', name)"
  >
    <svg
      v-if="variant === 'available'"
      class="size-3"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M6 1.5v9M1.5 6h9" />
    </svg>
    <span>{{ name }}</span>
    <svg
      v-if="variant === 'followed'"
      class="size-3"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
    </svg>
  </button>
</template>
