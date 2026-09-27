import { NextRequest } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { getCurrentUser } from '@/lib/auth'
import { createProgressRecord, getProgressRecord, updateProgressRecord } from '@/lib/progress-record-service'
import { JournalError } from '@/lib/journal/types'
import { GET, POST, PUT } from './route'
const db = vi.hoisted(() => ({ progressRecord: { findMany: vi.fn(), count: vi.fn() } }))
vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => db) }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/progress-record-service', () => ({ createProgressRecord: vi.fn(), getProgressRecord: vi.fn(), updateProgressRecord: vi.fn(), deleteProgressRecord: vi.fn() }))
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getCurrentUser).mockResolvedValue({ username: 'test' }) })
it('authenticates writes and single-record lookups', async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null)
  expect((await POST(new NextRequest('http://localhost/api/progress_record', { method: 'POST' }))).status).toBe(401)
  expect((await GET(new NextRequest('http://localhost/api/progress_record?id=123'))).status).toBe(401)
  expect(createProgressRecord).not.toHaveBeenCalled(); expect(getProgressRecord).not.toHaveBeenCalled()
})
it('loads a record independently of the paginated list', async () => {
  vi.mocked(getProgressRecord).mockResolvedValue({ id: 200, version: 4, metrics: [], plan_id: 'p', content: '', thinking: '', gmt_create: '2026-09-12T04:00:00Z', outcome: null, counts_toward_recurrence: false, schedule_block_id: null })
  const result = await GET(new NextRequest('http://localhost/api/progress_record?id=200'))
  expect(await result.json()).toMatchObject({ id: 200, version: 4, metrics: [] }); expect(db.progressRecord.findMany).not.toHaveBeenCalled()
})
it('keeps list and total pagination', async () => {
  db.progressRecord.findMany.mockResolvedValue([{ id: 1 }]); db.progressRecord.count.mockResolvedValue(101)
  const result = await GET(new NextRequest('http://localhost/api/progress_record?plan_id=p&pageNum=2&pageSize=10'))
  expect(await result.json()).toEqual({ list: [{ id: 1 }], total: 101 }); expect(db.progressRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { plan_id: 'p' }, skip: 10, take: 10 }))
})
it('returns stale writes as conflicts and rejects an invalid id', async () => {
  vi.mocked(updateProgressRecord).mockRejectedValue(new JournalError('STALE_VERSION', '已变化'))
  expect((await PUT(new NextRequest('http://localhost/api/progress_record', { method: 'PUT', body: JSON.stringify({ id: 2, expected_version: 1, content: '数据' }) }))).status).toBe(409)
  expect((await GET(new NextRequest('http://localhost/api/progress_record?id=oops'))).status).toBe(400)
})
