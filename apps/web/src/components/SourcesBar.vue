<script setup lang="ts">
import SourceIcon from './post/SourceIcon.vue'
import type { Source } from '../types.ts'

const props = defineProps<{
  /** Every source the user can pick from */
  sources: Source[]
  /** Ids of the picked sources; empty means all sources */
  selected: string[]
}>()

defineEmits<{ toggle: [id: string]; clear: [] }>()

const isSelected = (id: string) => props.selected.includes(id)
</script>

<template>
  <section v-if="sources.length > 0" class="mt-3" aria-label="Sources">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-2.5">
      <span class="w-20 shrink-0 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
        Sources
      </span>
      <!-- Same look as the tags: solid accent = on, dashed outline = off. Accent means
           "selected" and nothing else, so hovering an unselected pill never looks selected. -->
      <button
        v-for="source in sources"
        :key="source.id"
        type="button"
        class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border py-0 pr-3.5 pl-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :class="
          isSelected(source.id)
            ? 'border-accent bg-accent text-canvas hover:bg-accent/85'
            : 'border-dashed border-muted/40 text-ink hover:border-muted hover:bg-white/5'
        "
        :aria-pressed="isSelected(source.id)"
        @click="$emit('toggle', source.id)"
      >
        <!-- The logo always sits on the page-coloured tile, so it reads the same on a
             solid accent pill as on an outlined one. -->
        <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-canvas">
          <SourceIcon :id="source.id" :name="source.name" />
        </span>
        <span>{{ source.name }}</span>
        <svg
          v-if="isSelected(source.id)"
          data-testid="check"
          class="size-3.5"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M2 6.5l2.5 2.5L10 3.5" />
        </svg>
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
