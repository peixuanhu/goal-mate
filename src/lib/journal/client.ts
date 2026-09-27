import { refreshQuadrantSidebar } from '@/lib/utils'
export class JournalRequestError extends Error {
  constructor(public status: number, public code: string | undefined, message: string) { super(message) }
}
export async function journalRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...init, headers })
  let body: unknown
  try { body = await response.json() }
  catch { throw new JournalRequestError(response.status, undefined, '请求失败，请重试') }
  if (!response.ok) {
    const error = body as { error?: string; code?: string } | null
    throw new JournalRequestError(response.status, error?.code, error?.error ?? '请求失败，请重试')
  }
  return body as T
}
export function notifyJournalChanged(detail: { entity: 'journal' | 'progress-record'; date?: string }) {
  window.dispatchEvent(new CustomEvent('goal-mate:data-changed', { detail }))
  refreshQuadrantSidebar()
}
