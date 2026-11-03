<script setup lang="ts">
import { onMounted, ref } from 'vue'
import FeedHeader from './components/FeedHeader.vue'
import { api, ApiError } from './api/index.ts'

const tags = ref<string[]>([])

onMounted(async () => {
  tags.value = await api.tags.list()
  if (tags.value.length > 0) {
    console.log(tags.value)
  }
})
</script>

<template>
  <div class="mx-auto max-w-346 px-4 sm:px-8">
    <FeedHeader :posts="17" :sources="6" :interests="5" />
  </div>
</template>
