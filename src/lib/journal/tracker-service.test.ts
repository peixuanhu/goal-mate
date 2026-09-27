import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultTrackerConfig } from './defaults'
import { createTracker, updateTracker, archiveTracker, reorderTrackers } from './tracker-service'

describe.skipIf(!process.env.JOURNAL_TEST_DATABASE_URL)('journal tracker transactions', () => {
  let db: PrismaClient
  const ids: string[] = []
  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: process.env.JOURNAL_TEST_DATABASE_URL })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T04:00:00Z'))
  })
  afterAll(async () => {
    if (ids.length) {
      await db.trackerRevision.deleteMany({ where: { tracker_id: { in: ids } } })
      await db.trackerDefinition.deleteMany({ where: { tracker_id: { in: ids } } })
    }
    await db.$disconnect()
    vi.useRealTimers()
  })
  const create = async () => {
    const row = await createTracker(db, { name: '运动', kind: 'quantity', group: '测试', color: '#b6d99d',
      enabled_from: '2026-09-01', plan_id: null, goal_id: null, config: { ...defaultTrackerConfig('quantity'), unit: '分钟' } })
    ids.push(row.tracker_id)
    return row
  }
  it('changes display metadata without changing a historical revision', async () => {
    const row = await create()
    const updated = await updateTracker(db, { action: 'display', tracker_id: row.tracker_id, expected_version: row.version, name: '锻炼', group: '生活', color: '#aabbcc' })
    expect(updated.name).toBe('锻炼')
    expect(updated.version).toBe(2)
    expect(updated.revisions).toEqual(row.revisions)
    await expect(updateTracker(db, { action: 'display', tracker_id: row.tracker_id, expected_version: 1, name: '旧页面', group: '生活', color: '#aabbcc' })).rejects.toMatchObject({ code: 'STALE_VERSION' })
  })
  it('keeps the old unit when a future semantic revision is created', async () => {
    const row = await create()
    const updated = await updateTracker(db, { action: 'revise', tracker_id: row.tracker_id, expected_version: row.version,
      effective_from: '2026-10-01', plan_id: null, goal_id: null, config: { ...row.revisions[0].config, unit: '小时' } })
    expect(updated.revisions.map(revision => revision.config.unit)).toEqual(['分钟', '小时'])
    await expect(updateTracker(db, { action: 'revise', tracker_id: row.tracker_id, expected_version: 2,
      effective_from: '2026-09-01', plan_id: null, goal_id: null, config: row.revisions[0].config })).rejects.toMatchObject({ code: 'VALIDATION' })
  })
  it('archives while preserving the definition and revisions', async () => {
    const row = await create()
    const archived = await archiveTracker(db, { tracker_id: row.tracker_id, expected_version: 1, archived_from: '2026-09-27' })
    expect(archived.archived_from).toBe('2026-09-27')
    expect(archived.revisions).toHaveLength(1)
  })
  it('rejects an order missing a concurrently created tracker', async () => {
    await create()
    await expect(reorderTrackers(db, { ids: [], expected_versions: {} })).rejects.toMatchObject({ code: 'STALE_VERSION' })
  })
})
