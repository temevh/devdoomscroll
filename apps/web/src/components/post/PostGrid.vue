<script setup lang="ts">
import type { Post } from '../../types.ts'
import PostCard from './PostCard.vue'

defineProps<{
  posts: Post[]
  followed: string[]
}>()

defineEmits<{ follow: [tag: string] }>()
</script>

<template>
  <section
    class="mt-10 grid grid-flow-dense grid-cols-1 gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    aria-label="Posts"
  >
    <PostCard
      v-for="post in posts"
      :key="post.id"
      :post="post"
      :followed="followed"
      @follow="$emit('follow', $event)"
    />
  </section>
</template>
