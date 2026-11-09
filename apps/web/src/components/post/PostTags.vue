<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  tags: string[]
  followed: string[]
}>()

defineEmits<{ follow: [tag: string] }>()

// Followed tags first, highlighted; the rest can be followed with one click.
const sorted = computed(() => {
  const isFollowed = (tag: string) => props.followed.includes(tag.toLowerCase())
  return [...props.tags]
    .map((tag) => ({ tag, followed: isFollowed(tag) }))
    .sort((a, b) => Number(b.followed) - Number(a.followed))
})
</script>

<template>
  <ul class="flex flex-wrap gap-1.5">
    <li v-for="{ tag, followed: isFollowed } in sorted" :key="tag">
      <span
        v-if="isFollowed"
        class="inline-flex h-6 items-center rounded-full border border-accent/60 bg-accent/10 px-2.5 font-mono text-[11px] text-accent"
      >
        #{{ tag }}
      </span>
      <button
        v-else
        type="button"
        class="inline-flex h-6 cursor-pointer items-center rounded-full border border-line px-2.5 font-mono text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
        :aria-label="`Follow ${tag}`"
        @click="$emit('follow', tag)"
      >
        + {{ tag }}
      </button>
    </li>
  </ul>
</template>
