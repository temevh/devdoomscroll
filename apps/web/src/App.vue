<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import FeedHeader from './components/FeedHeader.vue'
import TagsBar from './components/TagsBar.vue'
import { api, type Post } from './api/index.ts'
import { useFollowedTags } from './composables/useFollowedTags.ts'

const tags = ref<string[]>([])
const posts = ref<Post[]>([])
const nextCursor = ref<string | null>(null)
const { followed, saved, hasChanges, save } = useFollowedTags()

let controller: AbortController | null = null

async function loadPosts() {
  controller?.abort()
  controller = new AbortController()
  const { signal } = controller
  try {
    const page = await api.posts.list(
      { tags: saved.value.length ? saved.value : undefined },
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

watch(saved, loadPosts, { immediate: true })
watch(posts, (value) => {
  console.log(value)
})
</script>

<template>
  <div class="mx-auto max-w-346 px-4 sm:px-8">
    <FeedHeader :posts="17" :sources="6" :interests="followed.length" />
    <TagsBar v-model:followed="followed" :tags="tags" :has-changes="hasChanges" @save="save" />
  </div>
</template>
