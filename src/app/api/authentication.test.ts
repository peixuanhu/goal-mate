import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createToken } from '@/lib/auth'

const { session, databaseOperation, copilotEndpoint, deleteCookie } = vi.hoisted(() => ({
  session: { token: undefined as string | undefined },
  databaseOperation: vi.fn(() => { throw new Error('Database accessed before authentication') }),
  copilotEndpoint: vi.fn(() => { throw new Error('AI accessed before authentication') }),
  deleteCookie: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => name === 'auth-token' && session.token ? { value: session.token } : undefined,
    delete: deleteCookie,
  }),
}))
vi.mock('@prisma/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@prisma/client')>(),
  PrismaClient: vi.fn(() => new Proxy({}, {
    get: (_target, property) => String(property).startsWith('$') ? databaseOperation : new Proxy({}, { get: () => databaseOperation }),
  })),
}))
vi.mock('@copilotkit/runtime', () => ({
  CopilotRuntime: class { constructor(public options: { actions: unknown[] }) {} get actions() { return this.options.actions } },
  OpenAIAdapter: class {},
  copilotRuntimeNextJSAppRouterEndpoint: copilotEndpoint,
}))

const secret = 'private-route-regression-secret'
const username = 'owner'
type Handler = (request: NextRequest) => Promise<Response>
const handlers: { path: string; method: string; run: Handler }[] = []
function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? routeFiles(path) : entry.name === 'route.ts' ? [path] : []
  })
}
const apiDirectory = join(process.cwd(), 'src/app/api')
const files = routeFiles(apiDirectory).filter((path) => !['auth/login/route.ts', 'mcp/route.ts'].includes(relative(apiDirectory, path)))
const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

{
  vi.stubEnv('OPENAI_API_KEY', 'test-key-not-real')
  vi.stubEnv('OPENAI_BASE_URL', 'https://example.invalid/v1')
  for (const file of files) {
    const routeModule = await import(file)
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      if (typeof routeModule[method] === 'function') handlers.push({ path: `/api/${relative(apiDirectory, file).replace('/route.ts', '')}`, method, run: routeModule[method] })
    }
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('AUTH_SECRET', secret)
  vi.stubEnv('AUTH_USERNAME', username)
  session.token = undefined
})
afterEach(() => vi.unstubAllEnvs())
afterAll(() => { logs.mockRestore(); errors.mockRestore() })

describe.each(handlers)('$method $path authenticates without middleware', ({ path, method, run }) => {
  it.each([
    ['missing cookie', () => undefined],
    ['fake cookie', () => 'fake-session'],
    ['forged JWT', () => jwt.sign({ username }, 'wrong-key', { expiresIn: '1h' })],
    ['expired JWT', () => jwt.sign({ username, exp: 1 }, secret)],
    ['wrong username', () => jwt.sign({ username: 'other' }, secret, { expiresIn: '1h' })],
    ['missing expiry', () => jwt.sign({ username }, secret)],
  ])('rejects %s before reading JSON, querying the database, or using AI', async (_label, token) => {
    session.token = token()
    const request = new NextRequest(`https://goal.test${path}`, { method })
    const readJson = vi.spyOn(request, 'json').mockRejectedValue(new Error('Body read before authentication'))
    const response = await run(request)
    expect(response.status).toBe(401)
    expect(readJson).not.toHaveBeenCalled()
    expect(databaseOperation).not.toHaveBeenCalled()
    expect(copilotEndpoint).not.toHaveBeenCalled()
    expect(deleteCookie).not.toHaveBeenCalled()
  })
})

describe('authenticated private API access', () => {
  it('accepts a real session for identity, diagnostics and logout without exposing API key fragments', async () => {
    session.token = createToken(username)
    vi.stubEnv('OPENAI_API_KEY', 'sk-sensitive-start-sensitive-end')
    for (const path of ['/api/auth/me', '/api/debug/env', '/api/copilotkit/health', '/api/auth/logout']) {
      const handler = handlers.find((item) => item.path === path)!
      const response = await handler.run(new NextRequest(`https://goal.test${path}`, { method: handler.method }))
      expect(response.status, path).toBe(200)
      const body = await response.text()
      expect(body).not.toContain('sk-sensi')
      expect(body).not.toContain('-end')
      expect(body).not.toContain('apiKeyMasked')
    }
    expect(deleteCookie).toHaveBeenCalledWith('auth-token')
  })
})
