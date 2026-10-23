import { createHash, webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../../../../middleware'
import { POST, GET, DELETE, PUT, PATCH, OPTIONS, HEAD, runtime, dynamic } from './route'

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  vi.stubEnv('GOAL_MATE_MCP_TOKEN_SHA256', createHash('sha256').update('route-test-only').digest('hex'))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Next MCP route boundary', () => {
  it('runs dynamically on Node and serves the real SDK', async () => {
    expect(runtime).toBe('nodejs')
    expect(dynamic).toBe('force-dynamic')
    const response = await POST(new Request('https://example.com/api/mcp', {
      method: 'POST', headers: { authorization: 'Bearer route-test-only', accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).result.tools.length).toBe(23)
  })

  it.each([['GET', GET], ['DELETE', DELETE], ['PUT', PUT], ['PATCH', PATCH], ['OPTIONS', OPTIONS], ['HEAD', HEAD]] as const)('%s authenticates before rejecting unsupported transport methods', async (method, handler) => {
    expect((await handler(new Request('https://example.com/api/mcp', { method }))).status).toBe(401)
    const response = await handler(new Request('https://example.com/api/mcp', { method, headers: { authorization: 'Bearer route-test-only' } }))
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
  })

  it('delegates only the exact MCP path to dedicated auth', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(middleware(new NextRequest('https://example.com/api/mcp')).headers.get('x-middleware-next')).toBe('1')
    expect(middleware(new NextRequest('https://example.com/api/mcpx')).status).toBe(401)
    expect(middleware(new NextRequest('https://example.com/api/mcp/nested')).status).toBe(401)
    expect(middleware(new NextRequest('https://example.com/api/goal')).status).toBe(401)
  })
})
