import { computed, ref } from 'vue'

const STORAGE_KEY = 'doom.followedTags'

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

export function useFollowedTags() {
  const saved = ref<string[]>(load())
  const followed = ref<string[]>([...saved.value])

  const hasChanges = computed(() => {
    if (followed.value.length !== saved.value.length) return true
    const savedSet = new Set(saved.value)
    return followed.value.some((t) => !savedSet.has(t))
  })

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(followed.value))
      saved.value = [...followed.value]
    } catch (err) {
      console.error('Could not save followed tags', err)
    }
  }

  return { followed, hasChanges, save }
}
