import type { Problem } from '../types.ts'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '')

export type QueryValue = string | number | boolean | string[] | null | undefined

export interface RequestOptions {
  query?: Record<string, QueryValue>
  signal?: AbortSignal
  headers?: Record<string, string>
}

/** Thrown for any non-2xx response. `problem` is set when the server sent problem+json. */
export class ApiError extends Error {
  readonly status: number
  readonly problem: Problem | null

  constructor(status: number, problem: Problem | null, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      // OpenAPI style: form, explode: false -> ?tags=a,b
      if (value.length > 0) params.set(key, value.join(','))
    } else {
      params.set(key, String(value))
    }
  }
  const qs = params.toString()
  return `${BASE_URL}${path}${qs ? `?${qs}` : ''}`
}

export async function get<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(buildUrl(path, options.query), {
    method: 'GET',
    headers: { Accept: 'application/json', ...options.headers },
    signal: options.signal,
  })

  if (!res.ok) {
    let problem: Problem | null = null
    try {
      problem = (await res.json()) as Problem
    } catch {
      // body was not JSON
    }
    throw new ApiError(res.status, problem, problem?.detail ?? problem?.title ?? res.statusText)
  }

  return (await res.json()) as T
}
