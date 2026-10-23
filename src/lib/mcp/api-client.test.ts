import { afterEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { createGoalMateApiClient } from './api-client'

afterEach(() => vi.unstubAllEnvs())
const credentials = () => 'signed-test-cookie'

describe('fixed loopback REST client', () => {
  it('uses only fixed loopback and signed session cookie, encoding query values', async () => {
    const fetcher = vi.fn(async () => Response.json({ list: [], total: 200 }))
    const api = createGoalMateApiClient({ fetch: fetcher, credentials, port: '3210' })
    expect(await api.request('/api/goal', 'GET', { query: { tag: 'a&url=https://evil.test', pageNum: 2 } })).toEqual({ list: [], total: 200 })
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url).origin).toBe('http://127.0.0.1:3210')
    expect(new URL(url).searchParams.get('tag')).toBe('a&url=https://evil.test')
    expect(new Headers(options.headers).get('cookie')).toBe('auth-token=signed-test-cookie')
    expect(new Headers(options.headers).has('authorization')).toBe(false)
    expect(options.redirect).toBe('error')
  })

  it.each([['https://evil.test/api/goal', 'GET'], ['/api/goal?all=true', 'GET'], ['/api/goal', 'DELETE'], ['/api/debug/env', 'GET']])('rejects non-allowlisted request %s %s', async (path, method) => {
    const fetcher = vi.fn()
    const api = createGoalMateApiClient({ fetch: fetcher, credentials })
    await expect(api.request(path, method)).rejects.toMatchObject({ code: 'INVALID_ENDPOINT' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('signs the existing auth-token using configured server credentials', async () => {
    vi.stubEnv('AUTH_USERNAME', 'mcp-user')
    vi.stubEnv('AUTH_SECRET', 'test-secret-without-production-use')
    const fetcher = vi.fn<typeof fetch>(async () => Response.json([]))
    await createGoalMateApiClient({ fetch: fetcher }).request('/api/tag', 'GET')
    const options = fetcher.mock.calls[0][1] as RequestInit
    const cookie = new Headers(options.headers).get('cookie')!.slice('auth-token='.length)
    expect(jwt.verify(cookie, 'test-secret-without-production-use')).toMatchObject({ username: 'mcp-user' })
  })

  it.each(['AUTH_USERNAME', 'AUTH_SECRET'])('fails closed without %s', async key => {
    vi.stubEnv('AUTH_USERNAME', 'mcp-user')
    vi.stubEnv('AUTH_SECRET', 'test-secret')
    vi.stubEnv(key, '')
    const fetcher = vi.fn()
    await expect(createGoalMateApiClient({ fetch: fetcher }).request('/api/tag', 'GET')).rejects.toMatchObject({ code: 'SERVER_CONFIGURATION' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('preserves actionable conflicts and hides 5xx internals', async () => {
    const conflict = { error: '时间块冲突', code: 'SCHEDULE_CONFLICT', conflictIds: ['block_1'], stack: 'private-stack' }
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(conflict, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ error: 'database-password secret', stack: 'private-stack' }, { status: 500 }))
    const api = createGoalMateApiClient({ fetch: fetcher, credentials })
    await expect(api.request('/api/schedule-block', 'PUT')).rejects.toMatchObject({ status: 409, code: 'SCHEDULE_CONFLICT', message: '时间块冲突', conflictIds: ['block_1'] })
    await expect(api.request('/api/tag', 'GET')).rejects.toMatchObject({ status: 502, code: 'BACKEND_ERROR', message: 'Goal Mate service unavailable' })
  })

  it.each([302, 307])('never follows a redirect (%i) or retries writes', async status => {
    const fetcher = vi.fn(async () => new Response(null, { status, headers: { location: 'https://evil.test' } }))
    await expect(createGoalMateApiClient({ fetch: fetcher, credentials }).request('/api/goal', 'POST', { body: { name: 'a', tag: 'b' } })).rejects.toMatchObject({ code: 'BACKEND_REDIRECT' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('bounds streamed response bytes and refuses invalid JSON', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('x'.repeat(2 * 1024 * 1024 + 1)))
      .mockResolvedValueOnce(new Response('<html>private backend page</html>'))
    const api = createGoalMateApiClient({ fetch: fetcher, credentials })
    await expect(api.request('/api/tag', 'GET')).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
    await expect(api.request('/api/tag', 'GET')).rejects.toMatchObject({ code: 'INVALID_BACKEND_RESPONSE' })
  })

  it('aborts timed out requests without retrying', async () => {
    const fetcher = vi.fn((_url: string | URL | Request, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('private network information')))
    }))
    await expect(createGoalMateApiClient({ fetch: fetcher, credentials, timeoutMs: 10 }).request('/api/tag', 'GET')).rejects.toMatchObject({ code: 'BACKEND_TIMEOUT' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
