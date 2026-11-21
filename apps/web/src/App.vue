<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import FeedHeader from './components/FeedHeader.vue'
import TagsBar from './components/TagsBar.vue'
import SourcesBar from './components/SourcesBar.vue'
import PostGrid from './components/post/PostGrid.vue'
import { api, type Post, type Source } from './api/index.ts'
import { useFollowedTags } from './composables/useFollowedTags.ts'
import { useSelectedSources } from './composables/useSelectedSources.ts'

const tags = ref<string[]>([])
const sources = ref<Source[]>([])
const posts = ref<Post[]>([])
const nextCursor = ref<string | null>(null)
const { followed, saved, hasChanges: tagChanges, save: saveTags } = useFollowedTags()
const {
  selected: selectedSources,
  saved: savedSources,
  hasChanges: sourceChanges,
  save: saveSources,
  toggle: toggleSource,
} = useSelectedSources()
const hasChanges = computed(() => tagChanges.value || sourceChanges.value)
const sourceCount = computed(() => new Set(posts.value.map((p) => p.source.id)).size)

/** One Save button covers both the followed tags and the selected sources. */
function save() {
  saveTags()
  saveSources()
}

function follow(tag: string) {
  const name = tag.toLowerCase()
  if (!followed.value.includes(name)) followed.value = [...followed.value, name]
}

let controller: AbortController | null = null

async function loadPosts() {
  controller?.abort()
  controller = new AbortController()
  const { signal } = controller
  try {
    const page = await api.posts.list(
      {
        tags: saved.value.length ? saved.value : undefined,
        sources: savedSources.value.length ? savedSources.value : undefined,
      },
      { signal },
    )
    posts.value = page.items
    nextCursor.value = page.nextCursor
  } catch (err) {
    if (signal.aborted) return
    console.error('Failed to load posts', err)
  }
}

onMounted(async () => {
  try {
    tags.value = await api.tags.list()
  } catch (err) {
    console.error('Failed to load tags', err)
  }
})

onMounted(async () => {
  try {
    sources.value = await api.sources.list()
  } catch (err) {
    console.error('Failed to load sources', err)
  }
})

watch([saved, savedSources], loadPosts, { immediate: true })
</script>

<template>
  <div class="mx-auto max-w-346 px-4 sm:px-8">
    <FeedHeader :posts="posts.length" :sources="sourceCount" :interests="followed.length" />
    <TagsBar v-model:followed="followed" :tags="tags" :has-changes="hasChanges" @save="save" />
    <SourcesBar
      :sources="sources"
      :selected="selectedSources"
      @toggle="toggleSource"
      @clear="selectedSources = []"
    />
    <PostGrid :posts="posts" :followed="followed" @follow="follow" />
  </div>
</template>
