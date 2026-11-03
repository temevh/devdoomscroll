import { get, type RequestOptions } from './client.ts'
import type { ListPostsParams, Page, Post } from '../types.ts'

export { ApiError } from './client.ts'
export type * from '../types.ts'

type CallOptions = Pick<RequestOptions, 'signal'>

export const api = {
  posts: {
    /** GET /posts — newest first, paginated with nextCursor */
    list: (params: ListPostsParams = {}, options: CallOptions = {}) =>
      get<Page<Post>>('/posts', { ...options, query: { ...params } }),
  },
  tags: {
    /** GET /tags — all selectable tag names */
    list: (options: CallOptions = {}) => get<string[]>('/tags', options),
  },
}
