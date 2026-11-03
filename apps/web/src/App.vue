<script setup lang="ts">
import { onMounted, ref } from 'vue'
import FeedHeader from './components/FeedHeader.vue'
import TagsBar from './components/TagsBar.vue'
import { api } from './api/index.ts'
import { useFollowedTags } from './composables/useFollowedTags.ts'

const tags = ref<string[]>([])
const { followed, hasChanges, save } = useFollowedTags()

onMounted(async () => {
  try {
    tags.value = await api.tags.list()
  } catch (err) {
    console.error('Failed to load tags', err)
  }
})
</script>

<template>
  <div class="mx-auto max-w-346 px-4 sm:px-8">
    <FeedHeader :posts="17" :sources="6" :interests="followed.length" />
    <TagsBar v-model:followed="followed" :tags="tags" :has-changes="hasChanges" @save="save" />
  </div>
</template>
