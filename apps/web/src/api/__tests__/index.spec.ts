import { afterEach, describe, expect, it, vi } from 'vitest'

/** client.ts reads VITE_API_BASE_URL once at import, so load a fresh copy per test. */
async function loadApi() {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', '/api')
  return (await import('../index.ts')).api
}

function stubFetch(body: unknown) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body)),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const lastUrl = (fetchMock: ReturnType<typeof stubFetch>) =>
  new URL(fetchMock.mock.lastCall![0], 'http://localhost')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('api.posts.list', () => {
  it('sends the selected sources as a comma-separated "sources" param', async () => {
    const fetchMock = stubFetch({ items: [], nextCursor: null })
    const api = await loadApi()

    await api.posts.list({ sources: ['devto', 'hackernews'] })

    const url = lastUrl(fetchMock)
    expect(url.pathname).toBe('/api/posts')
    expect(url.searchParams.get('sources')).toBe('devto,hackernews')
  })

  it('sends tags and sources together', async () => {
    const fetchMock = stubFetch({ items: [], nextCursor: null })
    const api = await loadApi()

    await api.posts.list({ tags: ['python', 'ai'], sources: ['github'] })

    const { searchParams } = lastUrl(fetchMock)
    expect(searchParams.get('tags')).toBe('python,ai')
    expect(searchParams.get('sources')).toBe('github')
  })

  it('leaves "sources" out when none are selected, which means all sources', async () => {
    const fetchMock = stubFetch({ items: [], nextCursor: null })
    const api = await loadApi()

    await api.posts.list({ sources: [] })
    expect(lastUrl(fetchMock).searchParams.has('sources')).toBe(false)

    await api.posts.list({ sources: undefined })
    expect(lastUrl(fetchMock).searchParams.has('sources')).toBe(false)
  })
})

describe('api.sources.list', () => {
  it('requests GET /sources and returns the parsed sources', async () => {
    const sources = [
      { id: 'devto', name: 'dev.to' },
      { id: 'hackernews', name: 'Hacker News' },
    ]
    const fetchMock = stubFetch(sources)
    const api = await loadApi()

    await expect(api.sources.list()).resolves.toEqual(sources)

    expect(lastUrl(fetchMock).pathname).toBe('/api/sources')
  })

  it('passes the abort signal through', async () => {
    const fetchMock = stubFetch([])
    const api = await loadApi()
    const { signal } = new AbortController()

    await api.sources.list({ signal })

    expect(fetchMock.mock.lastCall![1]!.signal).toBe(signal)
  })
})
