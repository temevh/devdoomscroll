import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFollowedTags } from '../useFollowedTags.ts'
import { useSelectedSources } from '../useSelectedSources.ts'

const STORAGE_KEY = 'doom.selectedSources'

/**
 * A minimal in-memory Storage, installed as the global `localStorage`. Newer Node
 * versions ship their own (unconfigured) localStorage that shadows jsdom's, so the
 * tests don't rely on whichever one the runtime provides.
 */
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

let storage: Storage
const store = (value: unknown) => storage.setItem(STORAGE_KEY, JSON.stringify(value))

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useSelectedSources', () => {
  describe('loading', () => {
    it('starts empty (meaning "all sources") when nothing is stored', () => {
      const { saved, selected, hasChanges } = useSelectedSources()

      expect(saved.value).toEqual([])
      expect(selected.value).toEqual([])
      expect(hasChanges.value).toBe(false)
    })

    it('starts from the stored source ids', () => {
      store(['devto', 'hackernews'])

      const { saved, selected, hasChanges } = useSelectedSources()

      expect(saved.value).toEqual(['devto', 'hackernews'])
      expect(selected.value).toEqual(['devto', 'hackernews'])
      expect(hasChanges.value).toBe(false)
    })

    it('ignores stored values that are not a JSON array of strings', () => {
      storage.setItem(STORAGE_KEY, '{not json')
      expect(useSelectedSources().saved.value).toEqual([])

      store({ devto: true })
      expect(useSelectedSources().saved.value).toEqual([])

      store(['devto', 3, null, 'github'])
      expect(useSelectedSources().saved.value).toEqual(['devto', 'github'])
    })

    it('starts empty when storage cannot be read', () => {
      vi.spyOn(storage, 'getItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })

      expect(useSelectedSources().saved.value).toEqual([])
    })
  })

  describe('toggle', () => {
    it('adds a source that is not selected', () => {
      const { selected, toggle } = useSelectedSources()

      toggle('devto')
      toggle('github')

      expect(selected.value).toEqual(['devto', 'github'])
    })

    it('removes a source that is already selected', () => {
      store(['devto', 'github'])
      const { selected, toggle } = useSelectedSources()

      toggle('devto')

      expect(selected.value).toEqual(['github'])
    })

    it('toggling twice puts the selection back and clears hasChanges', () => {
      store(['devto'])
      const { selected, hasChanges, toggle } = useSelectedSources()

      toggle('github')
      expect(hasChanges.value).toBe(true)

      toggle('github')
      expect(selected.value).toEqual(['devto'])
      expect(hasChanges.value).toBe(false)
    })

    it('does not touch the saved list until save() is called', () => {
      store(['devto'])
      const { saved, toggle } = useSelectedSources()

      toggle('github')

      expect(saved.value).toEqual(['devto'])
      expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(['devto'])
    })
  })

  describe('hasChanges', () => {
    it('is true when a source is swapped for another of the same count', () => {
      store(['devto', 'github'])
      const { selected, hasChanges } = useSelectedSources()

      selected.value = ['devto', 'hackernews']

      expect(hasChanges.value).toBe(true)
    })

    it('ignores order', () => {
      store(['devto', 'github'])
      const { selected, hasChanges } = useSelectedSources()

      selected.value = ['github', 'devto']

      expect(hasChanges.value).toBe(false)
    })
  })

  describe('save', () => {
    it('writes the selection to localStorage and marks it as saved', () => {
      const { selected, saved, hasChanges, toggle, save } = useSelectedSources()
      toggle('stackoverflow')
      toggle('hackernews')

      save()

      expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(['stackoverflow', 'hackernews'])
      expect(saved.value).toEqual(['stackoverflow', 'hackernews'])
      expect(selected.value).toEqual(['stackoverflow', 'hackernews'])
      expect(hasChanges.value).toBe(false)
    })

    it('saves an empty selection, so "all sources" can be restored', () => {
      store(['devto'])
      const { saved, toggle, save } = useSelectedSources()
      toggle('devto')

      save()

      expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual([])
      expect(saved.value).toEqual([])
    })

    it('survives a reload', () => {
      const first = useSelectedSources()
      first.toggle('github')
      first.save()

      expect(useSelectedSources().saved.value).toEqual(['github'])
    })

    it('keeps the unsaved changes and logs when storage rejects the write', () => {
      vi.spyOn(storage, 'setItem').mockImplementation(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      })
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { saved, hasChanges, toggle, save } = useSelectedSources()
      toggle('devto')

      save()

      expect(saved.value).toEqual([])
      expect(hasChanges.value).toBe(true)
      expect(logged).toHaveBeenCalledOnce()
    })
  })

  describe('next to followed tags', () => {
    it('keeps its own storage key, separate from the followed tags', () => {
      const tags = useFollowedTags()
      const sources = useSelectedSources()
      tags.followed.value = ['python']
      sources.toggle('devto')

      tags.save()
      sources.save()

      expect(JSON.parse(storage.getItem('doom.followedTags')!)).toEqual(['python'])
      expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(['devto'])
    })

    it('does not read followed tags as selected sources', () => {
      storage.setItem('doom.followedTags', JSON.stringify(['python']))

      expect(useSelectedSources().saved.value).toEqual([])
    })
  })
})
