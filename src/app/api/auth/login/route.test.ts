import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setCookie = vi.hoisted(() => vi.fn())
vi.mock('next/headers', () => ({ cookies: async () => ({ set: setCookie }) }))

import { POST } from './route'

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('AUTH_USERNAME', 'test-user')
  vi.stubEnv('AUTH_PASSWORD', 'test-password')
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret')
})
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('production login cookies', () => {
  it.each([
    ['http://example.test', false],
    ['https://example.test', true],
  ])('allows login on %s while matching the transport security', async (origin, secure) => {
    const request = new NextRequest(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'test-user', password: 'test-password' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(setCookie).toHaveBeenCalledWith('auth-token', expect.any(String), expect.objectContaining({
      secure, httpOnly: true, sameSite: 'lax', path: '/',
    }))
  })
})
