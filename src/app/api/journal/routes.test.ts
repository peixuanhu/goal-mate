import { NextRequest } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { getCurrentUser } from '@/lib/auth'
import { JournalError } from '@/lib/journal/types'
import { putManualMeasurement } from '@/lib/journal/measurement-service'
import { queryJournalMonth } from '@/lib/journal/query'
import * as month from './month/route'
import * as trackers from './trackers/route'
import * as measurements from './measurements/route'
import * as events from './events/route'
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => ({})) }))
vi.mock('@/lib/journal/query', () => ({ queryJournalMonth: vi.fn(), queryJournalTrackers: vi.fn() }))
vi.mock('@/lib/journal/tracker-service', () => ({ createTracker: vi.fn(), updateTracker: vi.fn(), archiveTracker: vi.fn(), reorderTrackers: vi.fn() }))
vi.mock('@/lib/journal/measurement-service', () => ({ putManualMeasurement: vi.fn(), clearMeasurement: vi.fn() }))
vi.mock('@/lib/journal/event-service', () => ({ createJournalEvent: vi.fn(), updateJournalEvent: vi.fn(), deleteJournalEvent: vi.fn() }))
const input = { tracker_id: 't', date: '2026-09-12', expected_version: 2, value: false, status: 'recorded', note: '', request_id: '6b41b5ea-0f66-4a64-a72a-4cb2f39fcfc3' }
const request = (path: string, method = 'GET', body?: unknown) => new NextRequest(`http://localhost/api/journal/${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) })
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getCurrentUser).mockResolvedValue({ username: 'test' }) })
it('authenticates every journal route before reading the body or calling a service', async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null)
  for (const [run, path, method] of [[month.GET, 'month', 'GET'], [trackers.GET, 'trackers', 'GET'], [trackers.POST, 'trackers', 'POST'], [trackers.PUT, 'trackers', 'PUT'], [measurements.PUT, 'measurements', 'PUT'], [measurements.DELETE, 'measurements', 'DELETE'], [events.POST, 'events', 'POST'], [events.PUT, 'events', 'PUT'], [events.DELETE, 'events', 'DELETE']] as const) {
    expect((await run(request(path, method))).status).toBe(401)
  }
  expect(queryJournalMonth).not.toHaveBeenCalled(); expect(putManualMeasurement).not.toHaveBeenCalled()
})
it('preserves false and returns the saved version', async () => {
  vi.mocked(putManualMeasurement).mockResolvedValue({ value: false, version: 3 } as Awaited<ReturnType<typeof putManualMeasurement>>)
  const response = await measurements.PUT(request('measurements', 'PUT', input))
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ value: false, version: 3 })
  expect(putManualMeasurement).toHaveBeenCalledWith(expect.anything(), input)
})
it('returns a conflict without claiming success', async () => {
  vi.mocked(putManualMeasurement).mockRejectedValue(new JournalError('STALE_VERSION', '这个格子已变化'))
  const response = await measurements.PUT(request('measurements', 'PUT', input))
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: '这个格子已变化', code: 'STALE_VERSION' })
})
it('rejects malformed JSON and invalid mutation payloads before services', async () => {
  const badJson = new NextRequest('http://localhost/api/journal/events', { method: 'POST', body: '{' })
  expect((await events.POST(badJson)).status).toBe(400)
  expect((await measurements.PUT(request('measurements', 'PUT', { ...input, expected_version: -1 }))).status).toBe(400)
  expect((await trackers.PUT(request('trackers', 'PUT', { action: 'unknown' }))).status).toBe(400)
  expect((await events.DELETE(request('events?event_id=e&expected_version=0', 'DELETE'))).status).toBe(400)
})
it('maps validation and missing sources and hides unexpected exceptions', async () => {
  const logger = vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const [error, status] of [[new JournalError('VALIDATION', '月份无效'), 400], [new JournalError('NOT_FOUND', '已删除'), 404], [new Error('internal database secret'), 500]] as const) {
    vi.mocked(queryJournalMonth).mockRejectedValue(error)
    const response = await month.GET(request('month?month=2026-09'))
    expect(response.status).toBe(status); expect(JSON.stringify(await response.json())).not.toContain('internal database secret')
  }
  logger.mockRestore()
})
