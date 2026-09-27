// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { journalRequest, JournalRequestError, notifyJournalChanged } from './client'
afterEach(() => vi.unstubAllGlobals())
it('throws the server conflict without turning a failed write into success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '格子已变化', code: 'STALE_VERSION' }), { status: 409 })))
  await expect(journalRequest('/api/journal/measurements')).rejects.toMatchObject({ status: 409, code: 'STALE_VERSION', message: '格子已变化' })
})
it('keeps the HTTP status when a gateway returns HTML', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })))
  await expect(journalRequest('/api/journal/month')).rejects.toBeInstanceOf(JournalRequestError)
})
it('notifies both the workspace and old sidebar subscribers', () => {
  const shared = vi.fn(), legacy = vi.fn()
  window.addEventListener('goal-mate:data-changed', shared); window.addEventListener('quadrant-refresh', legacy)
  notifyJournalChanged({ entity: 'journal', date: '2026-09-12' })
  expect(shared).toHaveBeenCalledOnce(); expect(legacy).toHaveBeenCalledOnce()
  window.removeEventListener('goal-mate:data-changed', shared); window.removeEventListener('quadrant-refresh', legacy)
})
