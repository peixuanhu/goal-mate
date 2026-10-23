import { createHash, timingSafeEqual } from 'node:crypto'

/** Dedicated MCP credential. Web sessions and caller Host headers grant no access. */
export function authenticateMcp(request: Request): Response | null {
  const configured = process.env.GOAL_MATE_MCP_TOKEN_SHA256
  if (!configured || !/^[a-f\d]{64}$/i.test(configured)) {
    return Response.json({ error: 'MCP is unavailable' }, { status: 503 })
  }

  const authorization = request.headers.get('authorization') ?? ''
  const bearer = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i.exec(authorization)
  if (!bearer || bearer[1].length > 4096 || !timingSafeEqual(
    createHash('sha256').update(bearer[1]).digest(),
    Buffer.from(configured, 'hex'),
  )) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } })
  }

  if (request.headers.has('origin')) {
    return Response.json({ error: 'Browser origins are not supported' }, { status: 403 })
  }
  return null
}
