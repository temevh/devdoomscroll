<script setup lang="ts">
import { computed, ref } from 'vue'
import TagBadge from './TagBadge.vue'

const props = defineProps<{
  tags: string[]
  /** Show the Save button when the followed list differs from what is saved */
  hasChanges?: boolean
}>()

defineEmits<{ save: [] }>()

const followed = defineModel<string[]>('followed', { default: () => [] })
const available = computed(() => props.tags.filter((tag) => !followed.value.includes(tag)))
const draft = ref('')

function follow(tag: string) {
  const name = tag.trim().toLowerCase()
  if (name && !followed.value.includes(name)) followed.value = [...followed.value, name]
}

function unfollow(tag: string) {
  followed.value = followed.value.filter((t) => t !== tag)
}

function addDraft() {
  follow(draft.value)
  draft.value = ''
}
</script>

<template>
  <section class="mt-6 space-y-3" aria-label="Tags">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-2.5">
      <span class="w-20 shrink-0 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
        Following
      </span>
      <TagBadge
        v-for="tag in followed"
        :key="tag"
        :name="tag"
        variant="followed"
        @click="unfollow"
      />
      <span v-if="followed.length === 0" class="text-sm text-muted">
        Nothing yet. Pick a tag below.
      </span>
      <button
        v-else
        type="button"
        class="ml-2 cursor-pointer text-[13px] text-muted underline underline-offset-4 hover:text-ink"
        @click="followed = []"
      >
        Clear all
      </button>
      <button
        v-if="hasChanges"
        type="button"
        class="ml-auto h-8 cursor-pointer rounded-full border border-accent px-4 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-canvas"
        @click="$emit('save')"
      >
        Save changes
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-x-2 gap-y-2.5">
      <span class="w-20 shrink-0 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
        Add
      </span>
      <form
        class="flex h-9 items-center overflow-hidden rounded-full border border-line bg-white/3 focus-within:border-muted/60"
        @submit.prevent="addDraft"
      >
        <input
          v-model="draft"
          type="text"
          placeholder="Type any tag..."
          aria-label="Tag name"
          class="h-full w-36 bg-transparent pr-2 pl-4 text-sm text-ink placeholder:text-muted/70 focus:outline-none"
        />
        <button
          type="submit"
          class="h-full cursor-pointer bg-line px-4 text-sm font-semibold text-ink hover:bg-muted/30"
        >
          Add
        </button>
      </form>
      <TagBadge v-for="tag in available" :key="tag" :name="tag" @click="follow" />
    </div>
  </section>
</template>
