import { createHmac } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createToken, verifyToken } from './auth'

const secret = 'authentication-regression-secret'
const username = 'owner'
const expires = () => Math.floor(Date.now() / 1000) + 300

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', secret)
  vi.stubEnv('AUTH_USERNAME', username)
})
afterEach(() => vi.unstubAllEnvs())

describe('session tokens', () => {
  it('issues an HS256 session for seven days and verifies its identity', () => {
    const token = createToken(username)
    const decoded = jwt.decode(token, { complete: true })!
    expect(decoded.header.alg).toBe('HS256')
    const payload = decoded.payload as jwt.JwtPayload
    expect(payload.exp! - payload.iat!).toBe(7 * 24 * 60 * 60)
    expect(verifyToken(token)).toEqual({ username })
  })

  it.each([
    ['forged signature', () => jwt.sign({ username, exp: expires() }, 'another-secret')],
    ['expired session', () => jwt.sign({ username, exp: 1 }, secret)],
    ['another user', () => jwt.sign({ username: 'someone-else', exp: expires() }, secret)],
    ['missing username', () => jwt.sign({ exp: expires() }, secret)],
    ['non-string username', () => jwt.sign({ username: 42, exp: expires() }, secret)],
    ['missing expiration', () => jwt.sign({ username }, secret)],
    ['unsupported algorithm', () => jwt.sign({ username, exp: expires() }, secret, { algorithm: 'HS512' })],
    ['unsigned JWT', () => jwt.sign({ username, exp: expires() }, '', { algorithm: 'none' })],
    ['malformed cookie', () => 'not-a-jwt'],
  ])('rejects %s', (_label, token) => {
    expect(verifyToken(token())).toBeNull()
  })

  it('rejects a correctly signed token whose expiration overflows to infinity', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from('{"username":"owner","exp":1e999}').toString('base64url')
    const unsigned = `${header}.${payload}`
    const signature = createHmac('sha256', secret).update(unsigned).digest('base64url')
    expect(verifyToken(`${unsigned}.${signature}`)).toBeNull()
  })

  it.each(['AUTH_SECRET', 'AUTH_USERNAME'])('fails closed when %s is missing', (name) => {
    const token = createToken(username)
    vi.stubEnv(name, '')
    expect(verifyToken(token)).toBeNull()
    expect(() => createToken(username)).toThrow()
  })

  it('never logs rejected tokens or verification error data', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(verifyToken('untrusted-token-value')).toBeNull()
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })
})
