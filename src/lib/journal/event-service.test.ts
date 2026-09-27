import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createJournalEvent, updateJournalEvent, deleteJournalEvent } from './event-service'

describe.skipIf(!process.env.JOURNAL_TEST_DATABASE_URL)('journal event writes', () => {
  let db: PrismaClient
  const events: string[] = [], plans: string[] = []
  beforeAll(() => { db = new PrismaClient({ datasourceUrl: process.env.JOURNAL_TEST_DATABASE_URL }); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-27T04:00:00Z')) })
  afterAll(async () => { await db.journalEvent.deleteMany({ where: { event_id: { in: events } } }); await db.plan.deleteMany({ where: { plan_id: { in: plans } } }); await db.$disconnect(); vi.useRealTimers() })
  it('creates only one explicitly synced completion on replay and releases it on cancellation', async () => {
    const plan = await db.plan.create({ data: { plan_id: crypto.randomUUID(), name: '发布视频', is_recurring: true } }); plans.push(plan.plan_id)
    const input = { title: '新视频', start_date: '2026-09-12', end_date: '2026-09-12', note: '', status: 'completed' as const, plan_id: plan.plan_id, goal_id: null, sync_completion: true, request_id: crypto.randomUUID() }
    const event = await createJournalEvent(db, input); events.push(event.event_id)
    expect((await createJournalEvent(db, input)).event_id).toBe(event.event_id)
    expect(await db.progressRecord.count({ where: { plan_id: plan.plan_id } })).toBe(1)
    const cancelled = await updateJournalEvent(db, { ...input, event_id: event.event_id, expected_version: event.version!, status: 'planned', request_id: crypto.randomUUID() })
    expect(cancelled.progress_record_id).toBeNull()
    expect(await db.progressRecord.count({ where: { plan_id: plan.plan_id } })).toBe(0)
    await deleteJournalEvent(db, { event_id: event.event_id, expected_version: cancelled.version! })
  })
  it('allows a cross-month plan without recording a future completion', async () => {
    const input = { title: '旅行', start_date: '2026-09-28', end_date: '2026-10-03', note: '', status: 'planned' as const, plan_id: null, goal_id: null, sync_completion: false, request_id: crypto.randomUUID() }
    const event = await createJournalEvent(db, input); events.push(event.event_id)
    expect(event.end_date).toBe('2026-10-03')
    await expect(createJournalEvent(db, { ...input, status: 'completed', request_id: crypto.randomUUID() })).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
