<script setup lang="ts">
defineProps<{
  posts: number
  sources: number
  interests: number
}>()
</script>

<template>
  <header>
    <div class="flex items-center gap-2.5 border-b border-line pt-6 pb-5">
      <span class="size-3.5 rounded-[3px] bg-accent" aria-hidden="true" />
      <span class="text-[22px] leading-none font-bold tracking-tight">tagfeed</span>
    </div>

    <div class="mt-8 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
      <h1
        class="text-[clamp(3.25rem,7vw,4.75rem)] leading-[0.95] font-extrabold tracking-[-0.055em]"
      >
        Your feed
      </h1>
      <p class="font-mono text-[15px] text-muted">
        {{ posts }} posts · {{ sources }} sources · {{ interests }} interests
      </p>
    </div>
  </header>
</template>
