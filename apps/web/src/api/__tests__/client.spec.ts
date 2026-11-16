import { afterEach, describe, expect, it, vi } from 'vitest'

/** client.ts reads VITE_API_BASE_URL once at import, so load a fresh copy per test. */
async function loadClient(baseUrl?: string) {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', baseUrl)
  return import('../client.ts')
}

function stubFetch(respond: () => Response) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    respond(),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), init)

/** Query string of the request fetch was last called with. */
const lastQuery = (fetchMock: ReturnType<typeof stubFetch>) =>
  new URL(fetchMock.mock.lastCall![0], 'http://localhost').searchParams

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('get', () => {
  it('requests base URL + path with a JSON Accept header and returns the parsed body', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ hello: 'world' }))
    const { get } = await loadClient('http://api.test')

    await expect(get('/ping')).resolves.toEqual({ hello: 'world' })

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/ping', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: undefined,
    })
  })

  it('defaults the base URL to /api and ignores trailing slashes on a configured one', async () => {
    const fetchMock = stubFetch(() => jsonResponse([]))

    await (await loadClient()).get('/tags')
    expect(fetchMock.mock.lastCall![0]).toBe('/api/tags')

    await (await loadClient('http://api.test///')).get('/tags')
    expect(fetchMock.mock.lastCall![0]).toBe('http://api.test/tags')
  })

  it('sends custom headers and the abort signal', async () => {
    const fetchMock = stubFetch(() => jsonResponse([]))
    const { get } = await loadClient('/api')
    const { signal } = new AbortController()

    await get('/tags', { headers: { 'X-Test': '1' }, signal })

    const init = fetchMock.mock.lastCall![1]!
    expect(init.headers).toEqual({ Accept: 'application/json', 'X-Test': '1' })
    expect(init.signal).toBe(signal)
  })

  describe('query string', () => {
    it('joins arrays with commas (OpenAPI form, explode: false)', async () => {
      const fetchMock = stubFetch(() => jsonResponse([]))
      const { get } = await loadClient('/api')

      await get('/posts', { query: { tags: ['python', 'ai'] } })

      expect(lastQuery(fetchMock).get('tags')).toBe('python,ai')
    })

    it('stringifies numbers and booleans', async () => {
      const fetchMock = stubFetch(() => jsonResponse([]))
      const { get } = await loadClient('/api')

      await get('/posts', { query: { limit: 25, flag: false } })

      expect(lastQuery(fetchMock).get('limit')).toBe('25')
      expect(lastQuery(fetchMock).get('flag')).toBe('false')
    })

    it('leaves out undefined, null and empty-array values', async () => {
      const fetchMock = stubFetch(() => jsonResponse([]))
      const { get } = await loadClient('/api')

      await get('/posts', { query: { cursor: undefined, after: null, tags: [], limit: 5 } })

      expect([...lastQuery(fetchMock).keys()]).toEqual(['limit'])
    })

    it('adds no "?" when there is nothing to send', async () => {
      const fetchMock = stubFetch(() => jsonResponse([]))
      const { get } = await loadClient('/api')

      await get('/posts', { query: { tags: [] } })
      expect(fetchMock.mock.lastCall![0]).toBe('/api/posts')

      await get('/posts')
      expect(fetchMock.mock.lastCall![0]).toBe('/api/posts')
    })
  })

  describe('errors', () => {
    const problem = {
      type: 'https://doom.dev/problems/invalid-parameter',
      title: 'Invalid query parameter',
      status: 400,
      detail: 'limit: Too big',
    }

    it('throws an ApiError carrying the status and problem+json body', async () => {
      stubFetch(() => jsonResponse(problem, { status: 400 }))
      const { get, ApiError } = await loadClient('/api')

      const error = await get('/posts').catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({
        name: 'ApiError',
        status: 400,
        problem,
        message: 'limit: Too big',
      })
    })

    it('falls back to the problem title when there is no detail', async () => {
      stubFetch(() => jsonResponse({ ...problem, detail: undefined }, { status: 400 }))
      const { get } = await loadClient('/api')

      await expect(get('/posts')).rejects.toThrow('Invalid query parameter')
    })

    it('falls back to the status text when the body is not JSON', async () => {
      stubFetch(() => new Response('<html>oops</html>', { status: 502, statusText: 'Bad Gateway' }))
      const { get, ApiError } = await loadClient('/api')

      const error = await get('/posts').catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status: 502, problem: null, message: 'Bad Gateway' })
    })

    it('does not swallow network failures', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
      const { get } = await loadClient('/api')

      await expect(get('/posts')).rejects.toThrow('Failed to fetch')
    })
  })
})
