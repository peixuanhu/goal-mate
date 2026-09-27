import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTracker } from './tracker-service'
import { defaultTrackerConfig } from './defaults'
import { clearMeasurement, putManualMeasurement } from './measurement-service'
import type { PutMeasurementInput } from './types'
import { updateProgressRecord } from '@/lib/progress-record-service'

describe.skipIf(!process.env.JOURNAL_TEST_DATABASE_URL)('journal transactional writes', () => {
  let db: PrismaClient
  const planIds: string[] = [], trackerIds: string[] = []
  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: process.env.JOURNAL_TEST_DATABASE_URL })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T04:00:00Z'))
  })
  afterAll(async () => {
    await db.trackerMeasurement.deleteMany({ where: { tracker_id: { in: trackerIds } } })
    await db.trackerRevision.deleteMany({ where: { tracker_id: { in: trackerIds } } })
    await db.trackerDefinition.deleteMany({ where: { tracker_id: { in: trackerIds } } })
    await db.plan.deleteMany({ where: { plan_id: { in: planIds } } })
    await db.$disconnect()
    vi.useRealTimers()
  })
  const seed = async (count = 1) => {
    const plan = await db.plan.create({ data: { plan_id: crypto.randomUUID(), name: '运动测试', is_recurring: true, recurrence_type: 'daily', recurrence_value: '1' } })
    planIds.push(plan.plan_id)
    const trackers = []
    for (let index = 0; index < count; index++) {
      const tracker = await createTracker(db, { name: `运动 ${index}`, kind: 'boolean', group: '测试', color: '#b6d99d',
        enabled_from: '2026-09-01', plan_id: plan.plan_id, goal_id: null, config: { ...defaultTrackerConfig('boolean'), sync_completion: true } })
      trackerIds.push(tracker.tracker_id)
      trackers.push(tracker)
    }
    return { plan, trackers }
  }
  const input = (tracker_id: string): PutMeasurementInput => ({ tracker_id, date: '2026-09-12', expected_version: 0, value: true, status: 'recorded', note: '已运动', request_id: crypto.randomUUID() })
  it('shares one real completion across two concurrent tracker writes and releases only the last reference', async () => {
    const { plan, trackers } = await seed(2)
    const [a, b] = await Promise.all(trackers.map(tracker => putManualMeasurement(db, input(tracker.tracker_id))))
    expect(await db.progressRecord.count({ where: { plan_id: plan.plan_id } })).toBe(1)
    expect(a.progress_record_id).toBe(b.progress_record_id)
    await clearMeasurement(db, { tracker_id: a.tracker_id, date: a.local_date, expected_version: a.version, request_id: crypto.randomUUID() })
    expect(await db.progressRecord.count({ where: { plan_id: plan.plan_id } })).toBe(1)
    await clearMeasurement(db, { tracker_id: b.tracker_id, date: b.local_date, expected_version: b.version, request_id: crypto.randomUUID() })
    expect(await db.progressRecord.count({ where: { plan_id: plan.plan_id } })).toBe(0)
  })
  it('replays a request without another completion and rejects an old version', async () => {
    const { plan, trackers } = await seed()
    const write = input(trackers[0].tracker_id)
    const first = await putManualMeasurement(db, write)
    expect(await putManualMeasurement(db, write)).toEqual(first)
    expect(await db.progressRecord.count({ where: { plan_id: plan.plan_id } })).toBe(1)
    await expect(putManualMeasurement(db, { ...write, value: false, request_id: crypto.randomUUID() })).rejects.toMatchObject({ code: 'STALE_VERSION' })
  })
  it('reuses and preserves an existing completion created outside the journal', async () => {
    const { plan, trackers } = await seed()
    const original = await db.progressRecord.create({ data: { plan_id: plan.plan_id, content: '真实执行', outcome: 'completed', gmt_create: new Date('2026-09-12T04:00:00Z') } })
    const value = await putManualMeasurement(db, input(trackers[0].tracker_id))
    expect(value.progress_record_id).toBe(original.id)
    await clearMeasurement(db, { tracker_id: value.tracker_id, date: value.local_date, expected_version: value.version, request_id: crypto.randomUUID() })
    expect(await db.progressRecord.findUnique({ where: { id: original.id } })).not.toBeNull()
  })
  it('records false and zero without changing plan percentage or completion count', async () => {
    const { plan, trackers } = await seed()
    expect((await putManualMeasurement(db, { ...input(trackers[0].tracker_id), value: false })).value).toBe(false)
    const tracker = await createTracker(db, { name: '播放量', kind: 'quantity', group: '测试', color: '#b6d99d',
      enabled_from: '2026-09-01', plan_id: plan.plan_id, goal_id: null, config: defaultTrackerConfig('quantity') })
    trackerIds.push(tracker.tracker_id)
    expect((await putManualMeasurement(db, { ...input(tracker.tracker_id), value: '0' })).value).toBe('0')
    expect(await db.progressRecord.count({ where: { plan_id: plan.plan_id } })).toBe(0)
    expect((await db.plan.findUniqueOrThrow({ where: { plan_id: plan.plan_id } })).progress).toBe(0)
  })
  it('rolls back a cell update when its owned source has moved to another day', async () => {
    const { trackers } = await seed()
    const first = await putManualMeasurement(db, input(trackers[0].tracker_id))
    await db.progressRecord.update({ where: { id: first.progress_record_id! }, data: { gmt_create: new Date('2026-09-13T04:00:00Z') } })
    await expect(putManualMeasurement(db, { ...input(trackers[0].tracker_id), expected_version: first.version })).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    expect((await db.trackerMeasurement.findUniqueOrThrow({ where: { measurement_id: first.measurement_id } })).version).toBe(first.version)
  })
  it('preserves independent daily cells when a moved source is reused on its new day', async () => {
    const { trackers } = await seed()
    const first = await putManualMeasurement(db, input(trackers[0].tracker_id))
    await updateProgressRecord(db, { id: first.progress_record_id!, expected_version: 1, custom_time: '2026-09-13T12:00' })
    const next = await putManualMeasurement(db, { ...input(trackers[0].tracker_id), date: '2026-09-13' })
    expect(next.progress_record_id).toBe(first.progress_record_id)
    expect((await db.trackerMeasurement.findUniqueOrThrow({ where: { measurement_id: first.measurement_id } })).boolean_value).toBe(true)
  })
  it('does not report an unlinked live source as deleted after recording false', async () => {
    const { plan, trackers } = await seed()
    const source = await db.progressRecord.create({ data: { plan_id: plan.plan_id, content: '原记录', outcome: 'completed', gmt_create: new Date('2026-09-12T04:00:00Z') } })
    const first = await putManualMeasurement(db, input(trackers[0].tracker_id))
    const next = await putManualMeasurement(db, { ...input(trackers[0].tracker_id), expected_version: first.version, value: false })
    expect(next.source_deleted).toBe(false); expect(await db.progressRecord.findUnique({ where: { id: source.id } })).not.toBeNull()
  })
})
