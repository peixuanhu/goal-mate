import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createProgressRecord, updateProgressRecord, deleteProgressRecord } from './progress-record-service'
import { createTracker } from './journal/tracker-service'
import { defaultTrackerConfig } from './journal/defaults'
import { queryJournalMonth } from './journal/query'

describe.skipIf(!process.env.JOURNAL_TEST_DATABASE_URL)('structured progress transactions', () => {
  let db: PrismaClient
  const plans: string[] = [], trackers: string[] = []
  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: process.env.JOURNAL_TEST_DATABASE_URL })
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T04:00:00Z'))
  })
  afterAll(async () => {
    await db.trackerMeasurement.deleteMany({ where: { tracker_id: { in: trackers } } })
    await db.trackerRevision.deleteMany({ where: { tracker_id: { in: trackers } } })
    await db.trackerDefinition.deleteMany({ where: { tracker_id: { in: trackers } } })
    await db.plan.deleteMany({ where: { plan_id: { in: plans } } }); await db.$disconnect(); vi.useRealTimers()
  })
  const seed = async () => {
    const plan = await db.plan.create({ data: { plan_id: crypto.randomUUID(), name: '自媒体' } }); plans.push(plan.plan_id)
    const tracker = await createTracker(db, { name: '播放量', kind: 'quantity', group: '测试', color: '#b6d99d', enabled_from: '2026-09-01', plan_id: plan.plan_id, goal_id: null,
      config: { ...defaultTrackerConfig('quantity'), source: 'progress_field' } }); trackers.push(tracker.tracker_id)
    const metric = { tracker_id: tracker.tracker_id, revision_id: tracker.revisions[0].revision_id, value: '0', status: 'recorded' as const, note: '' }
    return { plan, tracker, metric }
  }
  it('records metrics without inferring completion and projects a source moved across months', async () => {
    const { plan, tracker, metric } = await seed()
    const record = await createProgressRecord(db, { plan_id: plan.plan_id, content: '播放数据', thinking: '', custom_time: '2026-09-12T20:00', metrics: [metric] })
    expect(record.counts_toward_recurrence).toBe(false); expect(record.metrics[0].value).toBe('0')
    const moved = await updateProgressRecord(db, { id: record.id, expected_version: record.version, custom_time: '2026-10-01T08:00' })
    expect(moved.version).toBe(2)
    expect((await queryJournalMonth(db, '2026-09')).cells['2026-09-12'][tracker.tracker_id].value).toBeNull()
    expect((await queryJournalMonth(db, '2026-10')).cells['2026-10-01'][tracker.tracker_id].value).toBe('0')
    await deleteProgressRecord(db, { id: moved.id, expected_version: moved.version })
    const raw = await db.trackerMeasurement.findUniqueOrThrow({ where: { measurement_id: moved.metrics[0].measurement_id } })
    expect(raw.progress_record_id).toBeNull(); expect(raw.numeric_value?.toString()).toBe('0')
  })
  it('keeps legacy counts and preserves an explicit outcome when adding metrics', async () => {
    const { plan, metric } = await seed()
    const legacy = await createProgressRecord(db, { plan_id: plan.plan_id, content: '旧调用', thinking: '' })
    expect(legacy.counts_toward_recurrence).toBe(true)
    const completed = await createProgressRecord(db, { plan_id: plan.plan_id, content: '完成', thinking: '', outcome: 'completed' })
    const updated = await updateProgressRecord(db, { id: completed.id, expected_version: completed.version, metrics: [metric] })
    expect(updated.outcome).toBe('completed'); expect(updated.counts_toward_recurrence).toBe(true)
  })
  it('does not count an explicitly data-only text record as completion', async () => {
    const { plan } = await seed()
    await db.plan.update({ where: { plan_id: plan.plan_id }, data: { is_recurring: true } })
    const record = await createProgressRecord(db, { plan_id: plan.plan_id, content: '仅记录观察', thinking: '', outcome: null })
    expect(record.counts_toward_recurrence).toBe(false)
  })
  it('allows editing another metric after a cleared field is archived and the record moves', async () => {
    const { plan, tracker, metric } = await seed()
    const other = await createTracker(db, { name: '点赞', kind: 'quantity', group: '测试', color: '#b6d99d', enabled_from: '2026-09-01', plan_id: plan.plan_id, goal_id: null,
      config: { ...defaultTrackerConfig('quantity'), source: 'progress_field' } }); trackers.push(other.tracker_id)
    const second = { ...metric, tracker_id: other.tracker_id, revision_id: other.revisions[0].revision_id, value: '2' }
    const first = await createProgressRecord(db, { plan_id: plan.plan_id, content: '', thinking: '', custom_time: '2026-09-12T12:00', metrics: [metric, second] })
    const cleared = await updateProgressRecord(db, { id: first.id, expected_version: first.version, metrics: [{ ...metric, status: 'cleared', value: null }, second] })
    await db.trackerDefinition.update({ where: { tracker_id: tracker.tracker_id }, data: { archived_from: new Date('2026-10-05T00:00:00Z') } })
    const moved = await updateProgressRecord(db, { id: first.id, expected_version: cleared.version, custom_time: '2026-10-05T12:00' })
    const edited = await updateProgressRecord(db, { id: first.id, expected_version: moved.version, metrics: [{ ...metric, status: 'cleared', value: null }, { ...second, value: '20' }] })
    expect(edited.metrics.find(item => item.tracker_id === other.tracker_id)?.value).toBe('20')
    expect(edited.metrics.find(item => item.tracker_id === tracker.tracker_id)?.status).toBe('cleared')
  })
  it('rolls back the record and explicit percentage when a measurement is invalid', async () => {
    const { plan, metric } = await seed()
    await expect(createProgressRecord(db, { plan_id: plan.plan_id, content: '数据', thinking: '', plan_progress: .5, metrics: [{ ...metric, value: 'NaN' }] })).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(await db.progressRecord.count({ where: { plan_id: plan.plan_id } })).toBe(0)
    expect((await db.plan.findUniqueOrThrow({ where: { plan_id: plan.plan_id } })).progress).toBe(0)
  })
  it('makes a retried creation idempotent even after later edits', async () => {
    const { plan } = await seed()
    const input = { plan_id: plan.plan_id, content: '原内容', thinking: '', request_id: crypto.randomUUID() }
    const first = await createProgressRecord(db, input)
    await updateProgressRecord(db, { id: first.id, expected_version: first.version, content: '更新后' })
    expect((await createProgressRecord(db, input)).id).toBe(first.id)
    expect(await db.progressRecord.count({ where: { plan_id: plan.plan_id } })).toBe(1)
    await expect(createProgressRecord(db, { ...input, content: '不同载荷' })).rejects.toMatchObject({ code: 'STALE_VERSION' })
  })
  it('distinguishes omitted metrics from explicit clearing', async () => {
    const { plan, metric } = await seed()
    const first = await createProgressRecord(db, { plan_id: plan.plan_id, content: '', thinking: '', metrics: [metric] })
    const edited = await updateProgressRecord(db, { id: first.id, expected_version: 1, thinking: '观察' })
    expect(edited.metrics[0].value).toBe('0')
    const cleared = await updateProgressRecord(db, { id: first.id, expected_version: edited.version, metrics: [] })
    expect(cleared.metrics[0].status).toBe('cleared')
  })
  it('replays an update without a second version increment', async () => {
    const { plan } = await seed()
    const first = await createProgressRecord(db, { plan_id: plan.plan_id, content: '', thinking: '' })
    const input = { id: first.id, expected_version: first.version, content: '修改', request_id: crypto.randomUUID() }
    const updated = await updateProgressRecord(db, input)
    expect((await updateProgressRecord(db, input)).version).toBe(updated.version)
    await expect(updateProgressRecord(db, { ...input, content: '不同修改' })).rejects.toMatchObject({ code: 'STALE_VERSION' })
  })
})
