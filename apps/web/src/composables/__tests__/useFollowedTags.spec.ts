import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFollowedTags } from '../useFollowedTags.ts'

const STORAGE_KEY = 'doom.followedTags'

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

describe('useFollowedTags', () => {
  describe('loading', () => {
    it('starts empty when nothing is stored', () => {
      const { saved, followed, hasChanges } = useFollowedTags()

      expect(saved.value).toEqual([])
      expect(followed.value).toEqual([])
      expect(hasChanges.value).toBe(false)
    })

    it('starts from the stored tags', () => {
      store(['python', 'ai'])

      const { saved, followed, hasChanges } = useFollowedTags()

      expect(saved.value).toEqual(['python', 'ai'])
      expect(followed.value).toEqual(['python', 'ai'])
      expect(hasChanges.value).toBe(false)
    })

    it('ignores stored values that are not a JSON array', () => {
      storage.setItem(STORAGE_KEY, '{not json')
      expect(useFollowedTags().saved.value).toEqual([])

      store({ python: true })
      expect(useFollowedTags().saved.value).toEqual([])
    })

    it('keeps only the string entries of a stored array', () => {
      store(['python', 3, null, 'ai', { tag: 'x' }])

      expect(useFollowedTags().saved.value).toEqual(['python', 'ai'])
    })

    it('starts empty when storage cannot be read', () => {
      vi.spyOn(storage, 'getItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })

      expect(useFollowedTags().saved.value).toEqual([])
    })
  })

  describe('hasChanges', () => {
    it('is true once a tag is added or removed', () => {
      store(['python', 'ai'])
      const { followed, hasChanges } = useFollowedTags()

      followed.value = [...followed.value, 'rust']
      expect(hasChanges.value).toBe(true)

      followed.value = ['python']
      expect(hasChanges.value).toBe(true)
    })

    it('is true when a tag is swapped for another of the same count', () => {
      store(['python', 'ai'])
      const { followed, hasChanges } = useFollowedTags()

      followed.value = ['python', 'rust']

      expect(hasChanges.value).toBe(true)
    })

    it('ignores order', () => {
      store(['python', 'ai'])
      const { followed, hasChanges } = useFollowedTags()

      followed.value = ['ai', 'python']

      expect(hasChanges.value).toBe(false)
    })

    it('does not let edits to the followed list leak into the saved list', () => {
      store(['python'])
      const { followed, saved } = useFollowedTags()

      followed.value.push('ai')

      expect(saved.value).toEqual(['python'])
    })
  })

  describe('save', () => {
    it('writes the followed tags to localStorage and marks them as saved', () => {
      const { followed, saved, hasChanges, save } = useFollowedTags()
      followed.value = ['rust', 'go']

      save()

      expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(['rust', 'go'])
      expect(saved.value).toEqual(['rust', 'go'])
      expect(hasChanges.value).toBe(false)
    })

    it('survives a reload', () => {
      const first = useFollowedTags()
      first.followed.value = ['vue']
      first.save()

      expect(useFollowedTags().saved.value).toEqual(['vue'])
    })

    it('keeps the unsaved changes and logs when storage rejects the write', () => {
      vi.spyOn(storage, 'setItem').mockImplementation(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      })
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { followed, saved, hasChanges, save } = useFollowedTags()
      followed.value = ['rust']

      save()

      expect(saved.value).toEqual([])
      expect(hasChanges.value).toBe(true)
      expect(logged).toHaveBeenCalledOnce()
    })
  })
})
