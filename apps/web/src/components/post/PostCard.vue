<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Post } from '../../types.ts'
import { cardSize, cardSpanClass } from '../../lib/cardSize.ts'
import { timeAgo } from '../../lib/timeAgo.ts'
import { cardImage } from '../../lib/postImage.ts'
import SourceIcon from './SourceIcon.vue'
import PostTags from './PostTags.vue'

const props = defineProps<{
  post: Post
  followed: string[]
}>()

defineEmits<{ follow: [tag: string] }>()

const image = computed(() => cardImage(props.post.image))

/** width / height once the image has loaded; null when there is no (working) image */
const imageAspect = ref<number | null | undefined>()
watch(image, (image) => (imageAspect.value = image ? undefined : null), { immediate: true })

function onImageLoad(event: Event) {
  const img = event.target as unknown as { naturalWidth: number; naturalHeight: number }
  imageAspect.value = img.naturalHeight ? img.naturalWidth / img.naturalHeight : undefined
}

const size = computed(() =>
  cardSize({
    title: props.post.title,
    preview: props.post.preview,
    imageAspect: imageAspect.value,
  }),
)
const big = computed(() => size.value === 'feature' || size.value === 'wide')
</script>

<template>
  <article
    class="flex flex-col overflow-hidden rounded-xl border border-line bg-[#181a17] transition-colors hover:border-muted/40"
    :class="cardSpanClass[size]"
  >
    <img
      v-if="image && imageAspect !== null"
      :src="image"
      alt=""
      loading="lazy"
      class="w-full border-b border-line object-cover object-top"
      :class="size === 'feature' ? 'aspect-video max-h-72' : 'aspect-2/1'"
      @load="onImageLoad"
      @error="imageAspect = null"
    />

    <div class="flex flex-1 flex-col gap-3 p-4" :class="{ 'sm:p-5': big }">
      <p class="flex min-w-0 items-center gap-2 text-[13px]">
        <SourceIcon :id="post.source.id" :name="post.source.name" />
        <span class="font-semibold">{{ post.source.name }}</span>
        <time :datetime="post.publishedAt" class="font-mono text-[11px] text-muted">
          {{ timeAgo(post.publishedAt) }}
        </time>
      </p>

      <h2
        class="font-bold tracking-tight text-balance"
        :class="
          size === 'feature' ? 'text-2xl leading-tight sm:text-[26px]' : 'text-[17px] leading-snug'
        "
      >
        <a :href="post.url" target="_blank" rel="noopener" class="hover:text-accent">
          {{ post.title }}
        </a>
      </h2>

      <p v-if="post.preview" class="text-sm leading-relaxed text-muted">{{ post.preview }}</p>

      <div class="mt-auto space-y-3 pt-2">
        <PostTags
          v-if="post.tags.length"
          :tags="post.tags"
          :followed="followed"
          @follow="$emit('follow', $event)"
        />
        <a
          :href="post.url"
          target="_blank"
          rel="noopener"
          class="block border-t border-line pt-3 font-mono text-[11px] text-ink hover:text-accent"
        >
          Open on {{ post.source.name }} ↗
        </a>
      </div>
    </div>
  </article>
</template>
