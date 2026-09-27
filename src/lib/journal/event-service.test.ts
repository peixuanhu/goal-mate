import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createJournalEvent, updateJournalEvent, deleteJournalEvent } from './event-service'
import { createTracker, updateTracker } from './tracker-service'
import { defaultTrackerConfig } from './defaults'
import { queryJournalMonth } from './query'
import { updateProgressRecord } from '@/lib/progress-record-service'

describe.skipIf(!process.env.JOURNAL_TEST_DATABASE_URL)('journal event writes', () => {
  let db: PrismaClient
  const events: string[] = [], plans: string[] = [], trackers: string[] = []
  beforeAll(() => { db = new PrismaClient({ datasourceUrl: process.env.JOURNAL_TEST_DATABASE_URL }); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-27T04:00:00Z')) })
  afterAll(async () => {
    await db.journalEvent.deleteMany({ where: { event_id: { in: events } } })
    await db.trackerMeasurement.deleteMany({ where: { tracker_id: { in: trackers } } })
    await db.trackerRevision.deleteMany({ where: { tracker_id: { in: trackers } } })
    await db.trackerDefinition.deleteMany({ where: { tracker_id: { in: trackers } } })
    await db.plan.deleteMany({ where: { plan_id: { in: plans } } }); await db.$disconnect(); vi.useRealTimers()
  })
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
  it('replays a completed event update without a second version increment', async () => {
    const input = { title: '读书', start_date: '2026-09-12', end_date: '2026-09-12', note: '', status: 'planned' as const, plan_id: null, goal_id: null, sync_completion: false, request_id: crypto.randomUUID() }
    const first = await createJournalEvent(db, input); events.push(first.event_id)
    const edit = { ...input, event_id: first.event_id, expected_version: first.version!, title: '完成读书', status: 'completed' as const, request_id: crypto.randomUUID() }
    const updated = await updateJournalEvent(db, edit)
    expect((await updateJournalEvent(db, edit)).version).toBe(updated.version)
  })
  it('keeps the historical plan label when editing an event after that plan is deleted', async () => {
    const plan = await db.plan.create({ data: { plan_id: crypto.randomUUID(), name: '历史视频计划' } }); plans.push(plan.plan_id)
    const input = { title: '视频', start_date: '2026-09-12', end_date: '2026-09-12', note: '', status: 'completed' as const, plan_id: plan.plan_id, goal_id: null, sync_completion: true, request_id: crypto.randomUUID() }
    const event = await createJournalEvent(db, input); events.push(event.event_id)
    await db.plan.delete({ where: { plan_id: plan.plan_id } })
    await updateJournalEvent(db, { ...input, event_id: event.event_id, expected_version: event.version!, title: '保留的事件', plan_id: null, sync_completion: false, request_id: crypto.randomUUID() })
    expect((await db.journalEvent.findUniqueOrThrow({ where: { event_id: event.event_id } })).plan_name).toBe('历史视频计划')
  })
  it.each([false, true])('reprojects event-owned metrics on a date move only with compatible semantics (changed=%s)', async changed => {
    const plan = await db.plan.create({ data: { plan_id: crypto.randomUUID(), name: '专注' } }); plans.push(plan.plan_id)
    const config = { ...defaultTrackerConfig('quantity'), unit: '分钟', source: 'progress_field' as const }
    const tracker = await createTracker(db, { name: '时长', kind: 'quantity', group: '测试', color: '#b6d99d', enabled_from: '2026-09-01', plan_id: plan.plan_id, goal_id: null, config }); trackers.push(tracker.tracker_id)
    const input = { title: '专注', start_date: '2026-09-12', end_date: '2026-09-12', note: '', status: 'completed' as const, plan_id: plan.plan_id, goal_id: null, sync_completion: true, request_id: crypto.randomUUID() }
    const event = await createJournalEvent(db, input); events.push(event.event_id)
    await updateProgressRecord(db, { id: event.progress_record_id!, expected_version: 1, metrics: [{ tracker_id: tracker.tracker_id, revision_id: tracker.revisions[0].revision_id, value: '60', status: 'recorded', note: '' }] })
    const revised = await updateTracker(db, { action: 'revise', tracker_id: tracker.tracker_id, expected_version: tracker.version, effective_from: '2026-10-01', plan_id: plan.plan_id, goal_id: null, config: { ...config, unit: changed ? '小时' : '分钟' } })
    vi.setSystemTime(new Date('2026-10-05T04:00:00Z'))
    try {
      const edit = { ...input, event_id: event.event_id, expected_version: event.version!, start_date: '2026-10-01', end_date: '2026-10-01', request_id: crypto.randomUUID() }
      if (changed) {
        await expect(updateJournalEvent(db, edit)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
        expect((await queryJournalMonth(db, '2026-09')).cells['2026-09-12'][tracker.tracker_id].value).toBe('60')
        expect((await db.journalEvent.findUniqueOrThrow({ where: { event_id: event.event_id } })).version).toBe(event.version)
      } else {
        await updateJournalEvent(db, edit)
        expect((await queryJournalMonth(db, '2026-09')).cells['2026-09-12'][tracker.tracker_id].value).toBeNull()
        expect((await queryJournalMonth(db, '2026-10')).cells['2026-10-01'][tracker.tracker_id].value).toBe('60')
        expect((await db.trackerMeasurement.findFirstOrThrow({ where: { tracker_id: tracker.tracker_id } })).revision_id).toBe(revised.revisions.at(-1)!.revision_id)
      }
    } finally { vi.setSystemTime(new Date('2026-09-27T04:00:00Z')) }
  })
})
