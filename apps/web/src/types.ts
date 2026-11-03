// Types mirror openapi.yaml (components/schemas).

export interface Source {
  /** Stable identifier, e.g. "devto" */
  id: string
  /** Display name, e.g. "DEV Community" */
  name: string
}

export interface Post {
  id: string
  title: string
  /** Plain-text excerpt (max 200 chars), null when the source has no text */
  preview: string | null
  url: string
  /** ISO 8601 date-time string */
  publishedAt: string
  image: string | null
  tags: string[]
  source: Source
}

export interface Page<T> {
  items: T[]
  /** Pass to the next request to get the following page; null when there are no more */
  nextCursor: string | null
}

export interface ListPostsParams {
  /** Returns posts having at least one of these tags. Omit for all tags. */
  tags?: string[]
  /** 1–100, server default 50 */
  limit?: number
  /** nextCursor from a previous response (use the same tags) */
  cursor?: string
}

/** RFC 9457 problem details, returned on 4xx/5xx */
export interface Problem {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
}
