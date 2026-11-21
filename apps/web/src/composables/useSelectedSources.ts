import { useSavedList } from './useSavedList.ts'

/** Source ids the user wants in their feed. An empty selection means all sources. */
export function useSelectedSources() {
  const { draft: selected, saved, hasChanges, save } = useSavedList('doom.selectedSources')

  function toggle(id: string) {
    selected.value = selected.value.includes(id)
      ? selected.value.filter((s) => s !== id)
      : [...selected.value, id]
  }

  return { selected, saved, hasChanges, save, toggle }
}
