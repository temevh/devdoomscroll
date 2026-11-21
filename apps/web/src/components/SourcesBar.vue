<script setup lang="ts">
import SourceIcon from './post/SourceIcon.vue'
import type { Source } from '../types.ts'

defineProps<{
  /** Every source the user can pick from */
  sources: Source[]
  /** Ids of the picked sources; empty means all sources */
  selected: string[]
}>()

defineEmits<{ toggle: [id: string]; clear: [] }>()
</script>

<template>
  <section v-if="sources.length > 0" class="mt-3" aria-label="Sources">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-2.5">
      <span class="w-20 shrink-0 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
        Sources
      </span>
      <button
        v-for="source in sources"
        :key="source.id"
        type="button"
        class="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border py-0 pr-3.5 pl-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :class="
          selected.includes(source.id)
            ? 'border-accent bg-accent/15 text-accent hover:bg-accent/25'
            : 'border-line text-ink hover:border-accent hover:text-accent'
        "
        :aria-pressed="selected.includes(source.id)"
        @click="$emit('toggle', source.id)"
      >
        <SourceIcon :id="source.id" :name="source.name" />
        <span>{{ source.name }}</span>
      </button>
      <span v-if="selected.length === 0" class="text-sm text-muted">
        All sources. Pick some to narrow the feed.
      </span>
      <button
        v-else
        type="button"
        class="ml-2 cursor-pointer text-[13px] text-muted underline underline-offset-4 hover:text-ink"
        @click="$emit('clear')"
      >
        Clear all
      </button>
    </div>
  </section>
</template>
