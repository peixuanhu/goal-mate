import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authenticateMcp } from './auth'

const token = 'test-only-mcp-bearer'
const digest = createHash('sha256').update(token).digest('hex')
afterEach(() => vi.unstubAllEnvs())

describe('MCP authentication boundary', () => {
  it.each([undefined, '', 'invalid', 'a'.repeat(63), 'g'.repeat(64)])('fails closed for disabled or malformed config %s', value => {
    vi.stubEnv('GOAL_MATE_MCP_TOKEN_SHA256', value)
    expect(authenticateMcp(new Request('https://example.com/api/mcp'))?.status).toBe(503)
  })

  it.each([undefined, 'Bearer wrong', `Basic ${token}`])('requires the correct Bearer credential: %s', authorization => {
    vi.stubEnv('GOAL_MATE_MCP_TOKEN_SHA256', digest)
    const headers = new Headers({ cookie: 'auth-token=existing-session' })
    if (authorization) headers.set('authorization', authorization)
    const response = authenticateMcp(new Request('https://example.com/api/mcp', { headers }))
    expect(response?.status).toBe(401)
    expect(response?.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('accepts a valid token and uppercase digest without trusting the host', () => {
    vi.stubEnv('GOAL_MATE_MCP_TOKEN_SHA256', digest.toUpperCase())
    expect(authenticateMcp(new Request('https://untrusted-host.test/api/mcp', {
      headers: { authorization: `Bearer ${token}` },
    }))).toBeNull()
  })

  it.each(['https://example.com', 'null', ''])('rejects browser Origin %s even with a token', origin => {
    vi.stubEnv('GOAL_MATE_MCP_TOKEN_SHA256', digest)
    expect(authenticateMcp(new Request('https://example.com/api/mcp', {
      headers: { authorization: `Bearer ${token}`, origin },
    }))?.status).toBe(403)
  })
})
