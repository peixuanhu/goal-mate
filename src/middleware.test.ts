import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createToken } from './lib/auth'
import { config, middleware } from './middleware'

const secret = 'middleware-regression-secret'
const username = 'owner'
const request = (path: string, token?: string, method = 'GET') => new NextRequest(`https://goal.test${path}`, {
  method,
  headers: token ? { cookie: `auth-token=${token}` } : undefined,
})

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', secret)
  vi.stubEnv('AUTH_USERNAME', username)
})
afterEach(() => vi.unstubAllEnvs())

describe('authentication middleware', () => {
  it('lives beside src/app so Next.js discovers it and uses the Node runtime', () => {
    expect(existsSync(resolve('src/middleware.ts'))).toBe(true)
    expect(existsSync(resolve('middleware.ts'))).toBe(false)
    expect(config.runtime).toBe('nodejs')
  })

  it.each(['/api/goal', '/api/report/weekly', '/api/auth/logout', '/api/goal.json', '/api/auth/login-extra', '/api/mcp/extra', '/api/mcp.json', '/api/_next/static/file.js'])('rejects anonymous requests to %s', async (path) => {
    const response = middleware(request(path))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '未授权' })
  })

  it.each([
    ['fake', () => 'anything'],
    ['forged', () => jwt.sign({ username }, 'wrong-secret', { expiresIn: '1h' })],
    ['expired', () => jwt.sign({ username, exp: 1 }, secret)],
    ['wrong user', () => jwt.sign({ username: 'other' }, secret, { expiresIn: '1h' })],
    ['missing expiration', () => jwt.sign({ username }, secret)],
  ])('rejects a %s cookie', (_label, token) => {
    expect(middleware(request('/api/goal', token())).status).toBe(401)
  })

  it.each(['/', '/login-extra', '/reports/private.pdf'])('redirects unauthenticated protected pages: %s', (path) => {
    const response = middleware(request(path, 'fake'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://goal.test/login')
  })

  it.each(['/login', '/favicon.ico', '/icon.svg', '/file.svg', '/globe.svg', '/next.svg', '/vercel.svg', '/window.svg', '/_next/static/chunks/app.js', '/_next/image?url=%2Ficon.svg&w=64&q=75', '/api/mcp'])('allows the exact public resource: %s', (path) => {
    expect(middleware(request(path)).headers.get('x-middleware-next')).toBe('1')
  })

  it('allows the login endpoint', () => {
    expect(middleware(request('/api/auth/login', undefined, 'POST')).headers.get('x-middleware-next')).toBe('1')
  })

  it.each(['/api/goal', '/'])('allows a valid session at %s', (path) => {
    expect(middleware(request(path, createToken(username))).headers.get('x-middleware-next')).toBe('1')
  })
})
