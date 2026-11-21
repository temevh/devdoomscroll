import { useSavedList } from './useSavedList.ts'

export function useFollowedTags() {
  const { draft: followed, saved, hasChanges, save } = useSavedList('doom.followedTags')
  return { followed, saved, hasChanges, save }
}
