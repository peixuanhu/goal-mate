import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { queryJournalMonth } from './query'
import { createTracker } from './tracker-service'
import { defaultTrackerConfig } from './defaults'

describe.skipIf(!process.env.JOURNAL_TEST_DATABASE_URL)('complete journal month projection', () => {
  let db: PrismaClient
  const plans: string[] = [], trackers: string[] = []
  beforeAll(() => { db = new PrismaClient({ datasourceUrl: process.env.JOURNAL_TEST_DATABASE_URL }) })
  afterAll(async () => {
    await db.trackerMeasurement.deleteMany({ where: { tracker_id: { in: trackers } } })
    await db.trackerRevision.deleteMany({ where: { tracker_id: { in: trackers } } })
    await db.trackerDefinition.deleteMany({ where: { tracker_id: { in: trackers } } })
    await db.plan.deleteMany({ where: { plan_id: { in: plans } } })
    await db.$disconnect()
  })
  const plan = async (recurring = true) => {
    const row = await db.plan.create({ data: { plan_id: crypto.randomUUID(), name: '测试计划', is_recurring: recurring } })
    plans.push(row.plan_id)
    return row
  }
  it('includes 150 source records without inheriting progress-list pagination', async () => {
    const p = await plan()
    const tracker = await createTracker(db, { name: '执行次数', kind: 'quantity', group: '测试', color: '#b6d99d', enabled_from: '2026-09-01', plan_id: p.plan_id, goal_id: null,
      config: { ...defaultTrackerConfig('quantity'), source: 'plan' } })
    trackers.push(tracker.tracker_id)
    await db.progressRecord.createMany({ data: Array.from({ length: 150 }, (_, index) => ({ plan_id: p.plan_id, content: `record ${index}`, gmt_create: new Date('2026-09-12T04:00:00Z'), outcome: 'completed', counts_toward_recurrence: true })) })
    const view = await queryJournalMonth(db, '2026-09', new Date('2026-10-05'))
    expect(view.cells['2026-09-12'][tracker.tracker_id].value).toBe('150')
    expect(view.cells['2026-09-12'][tracker.tracker_id].sources).toHaveLength(150)
    expect(view.events.filter(event => event.plan_id === p.plan_id)).toHaveLength(150)
  })
  it('projects source measurements by the live occurrence date and preserves deleted-source evidence', async () => {
    const p = await plan(false)
    const tracker = await createTracker(db, { name: '播放量', kind: 'quantity', group: '测试', color: '#b6d99d', enabled_from: '2026-09-01', plan_id: p.plan_id, goal_id: null,
      config: { ...defaultTrackerConfig('quantity'), source: 'progress_field' } })
    trackers.push(tracker.tracker_id)
    const source = await db.progressRecord.create({ data: { plan_id: p.plan_id, content: '数据', gmt_create: new Date('2026-09-12T04:00:00Z'), counts_toward_recurrence: false } })
    await db.trackerMeasurement.create({ data: { tracker_id: tracker.tracker_id, revision_id: tracker.revisions[0].revision_id, origin: 'progress_field',
      local_date: new Date('2026-09-12T00:00:00Z'), numeric_value: '0', progress_record_id: source.id, source_record_id: source.id } })
    await db.progressRecord.update({ where: { id: source.id }, data: { gmt_create: new Date('2026-10-01T04:00:00Z') } })
    const september = await queryJournalMonth(db, '2026-09', new Date('2026-10-05'))
    expect(september.cells['2026-09-12'][tracker.tracker_id].value).toBeNull()
    const october = await queryJournalMonth(db, '2026-10', new Date('2026-10-05'))
    expect(october.cells['2026-10-01'][tracker.tracker_id].value).toBe('0')
    await db.progressRecord.delete({ where: { id: source.id } })
    const orphan = await queryJournalMonth(db, '2026-09', new Date('2026-10-05'))
    expect(orphan.cells['2026-09-12'][tracker.tracker_id].value).toBeNull()
    expect(orphan.cells['2026-09-12'][tracker.tracker_id].sources.some(source => source.deleted)).toBe(true)
  })
  it('keeps ordinary prose and future completion evidence out of actual cells', async () => {
    const p = await plan(false)
    const tracker = await createTracker(db, { name: '运动', kind: 'boolean', group: '测试', color: '#b6d99d', enabled_from: '2026-09-01', plan_id: p.plan_id, goal_id: null,
      config: { ...defaultTrackerConfig('boolean'), source: 'plan', active_weekdays: [1, 3, 5] } })
    trackers.push(tracker.tracker_id)
    await db.progressRecord.create({ data: { plan_id: p.plan_id, content: '普通文本', gmt_create: new Date('2026-09-02T04:00:00Z') } })
    const view = await queryJournalMonth(db, '2026-09', new Date('2026-09-27T04:00:00Z'))
    expect(view.cells['2026-09-02'][tracker.tracker_id].state).toBe('missing')
    expect(view.cells['2026-09-05'][tracker.tracker_id].state).toBe('not_applicable')
    expect(view.cells['2026-09-28'][tracker.tracker_id].state).toBe('future')
  })
})
