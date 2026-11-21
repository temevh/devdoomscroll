import { computed, ref } from 'vue'

function load(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

/**
 * A list of strings kept in localStorage under `storageKey`. `draft` is edited freely;
 * `saved` only changes when `save()` succeeds, so `hasChanges` tells the UI when to
 * offer a Save button.
 */
export function useSavedList(storageKey: string) {
  const saved = ref<string[]>(load(storageKey))
  const draft = ref<string[]>([...saved.value])

  const hasChanges = computed(() => {
    if (draft.value.length !== saved.value.length) return true
    const savedSet = new Set(saved.value)
    return draft.value.some((t) => !savedSet.has(t))
  })

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft.value))
      saved.value = [...draft.value]
    } catch (err) {
      console.error(`Could not save ${storageKey}`, err)
    }
  }

  return { draft, saved, hasChanges, save }
}
