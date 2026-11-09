<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import FeedHeader from './components/FeedHeader.vue'
import TagsBar from './components/TagsBar.vue'
import PostGrid from './components/post/PostGrid.vue'
import { api, type Post } from './api/index.ts'
import { useFollowedTags } from './composables/useFollowedTags.ts'

const tags = ref<string[]>([])
const posts = ref<Post[]>([])
const nextCursor = ref<string | null>(null)
const { followed, saved, hasChanges, save } = useFollowedTags()
const sourceCount = computed(() => new Set(posts.value.map((p) => p.source.id)).size)

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
</script>

<template>
  <div class="mx-auto max-w-346 px-4 sm:px-8">
    <FeedHeader :posts="posts.length" :sources="sourceCount" :interests="followed.length" />
    <TagsBar v-model:followed="followed" :tags="tags" :has-changes="hasChanges" @save="save" />
    <PostGrid :posts="posts" :followed="followed" @follow="follow" />
  </div>
</template>
