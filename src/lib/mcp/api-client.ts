import { createToken } from '@/lib/auth'

const ALLOWED_ENDPOINTS: Readonly<Record<string, readonly string[]>> = {
  '/api/goal': ['GET', 'POST', 'PUT'],
  '/api/plan': ['GET', 'POST', 'PUT'],
  '/api/progress_record': ['GET', 'POST'],
  '/api/today': ['GET'],
  '/api/tag': ['GET'],
  '/api/journal/month': ['GET'],
  '/api/journal/trackers': ['GET'],
  '/api/report/weekly': ['GET'],
  '/api/planning-preference': ['GET', 'PUT'],
  '/api/action-item': ['GET', 'POST', 'PUT'],
  '/api/schedule-block': ['GET', 'POST', 'PUT'],
  '/api/schedule-block/complete': ['POST'],
}
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export class GoalMateApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly conflictIds?: string[],
  ) {
    super(message)
    this.name = 'GoalMateApiError'
  }
}

type RequestOptions = {
  query?: Record<string, string | number | boolean | undefined>
  body?: Record<string, unknown>
  idempotencyKey?: string
}

export interface GoalMateApiClient {
  request(path: string, method: string, options?: RequestOptions): Promise<unknown>
}

type ClientOptions = {
  fetch?: typeof fetch
  credentials?: () => string
  port?: string
  timeoutMs?: number
}

function sessionCredential(): string {
  if (!process.env.AUTH_USERNAME?.trim() || !process.env.AUTH_SECRET?.trim()) {
    throw new GoalMateApiError('SERVER_CONFIGURATION', 'Goal Mate authentication is not configured', 503)
  }
  return createToken(process.env.AUTH_USERNAME)
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new GoalMateApiError('INVALID_BACKEND_RESPONSE', 'Goal Mate returned invalid JSON', 502)
  let length = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new GoalMateApiError('RESPONSE_TOO_LARGE', 'Result exceeds 2 MiB; narrow the query or use a smaller page', 502)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new GoalMateApiError('INVALID_BACKEND_RESPONSE', 'Goal Mate returned invalid JSON', 502)
  }
}

/** This client cannot use a caller URL, arbitrary path, headers, or redirects. */
export function createGoalMateApiClient(options: ClientOptions = {}): GoalMateApiClient {
  return {
    async request(path, method, input = {}) {
      if (!Object.hasOwn(ALLOWED_ENDPOINTS, path) || !ALLOWED_ENDPOINTS[path].includes(method)) {
        throw new GoalMateApiError('INVALID_ENDPOINT', 'Unsupported Goal Mate operation', 400)
      }
      const port = options.port ?? process.env.PORT ?? '3000'
      if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
        throw new GoalMateApiError('SERVER_CONFIGURATION', 'Goal Mate port is not configured correctly', 503)
      }
      const url = new URL(`http://127.0.0.1:${port}${path}`)
      for (const [key, value] of Object.entries(input.query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value))
      }
      const headers = new Headers({ Accept: 'application/json', Cookie: `auth-token=${(options.credentials ?? sessionCredential)()}` })
      if (input.body !== undefined) headers.set('Content-Type', 'application/json')
      if (input.idempotencyKey !== undefined) headers.set('Idempotency-Key', input.idempotencyKey)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000)
      try {
        const response = await (options.fetch ?? fetch)(url.toString(), {
          method,
          headers,
          body: input.body === undefined ? undefined : JSON.stringify(input.body),
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        })
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel()
          throw new GoalMateApiError('BACKEND_REDIRECT', 'Goal Mate redirects are not allowed', 502)
        }
        if (response.status >= 500) {
          await response.body?.cancel()
          throw new GoalMateApiError('BACKEND_ERROR', 'Goal Mate service unavailable', 502)
        }
        const result = await readBoundedJson(response)
        if (!response.ok) {
          const detail = result && typeof result === 'object' ? result as Record<string, unknown> : {}
          // Only documented client-error fields cross the boundary; no stack or arbitrary objects.
          throw new GoalMateApiError(
            typeof detail.code === 'string' && /^[A-Z_]{1,64}$/.test(detail.code) ? detail.code : 'BACKEND_REJECTED',
            typeof detail.error === 'string' ? detail.error.slice(0, 1000) : 'Goal Mate rejected the operation',
            response.status,
            Array.isArray(detail.conflictIds) ? detail.conflictIds.filter((id): id is string => typeof id === 'string').slice(0, 100) : undefined,
          )
        }
        return result
      } catch (error) {
        if (error instanceof GoalMateApiError) throw error
        throw controller.signal.aborted
          ? new GoalMateApiError('BACKEND_TIMEOUT', 'Goal Mate request timed out; a write may have succeeded. Reuse its request ID when retrying', 504)
          : new GoalMateApiError('BACKEND_UNAVAILABLE', 'Goal Mate could not be reached; a write may have succeeded', 502)
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
