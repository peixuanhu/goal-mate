import jwt from 'jsonwebtoken'

export function createToken(username: string): string {
  const secret = process.env.AUTH_SECRET
  if (!secret || !process.env.AUTH_USERNAME) {
    throw new Error('Authentication is not configured')
  }
  return jwt.sign({ username }, secret, { algorithm: 'HS256', expiresIn: '7d' })
}

export function verifyToken(token: string): { username: string } | null {
  const secret = process.env.AUTH_SECRET
  const username = process.env.AUTH_USERNAME
  if (!secret || !username) return null

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    if (
      typeof payload === 'string' ||
      payload.username !== username ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp)
    ) return null

    return { username }
  } catch {
    return null
  }
}
