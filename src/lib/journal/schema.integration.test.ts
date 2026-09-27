import { PrismaClient } from '@prisma/client'
import { afterAll,beforeAll,describe,expect,it } from 'vitest'
describe.skipIf(!process.env.JOURNAL_TEST_DATABASE_URL)('journal persistence',()=>{
  let db:PrismaClient
  const ids:string[]=[]
  beforeAll(()=>{db=new PrismaClient({datasourceUrl:process.env.JOURNAL_TEST_DATABASE_URL})})
  afterAll(async()=>{
    if (ids.length) await db.trackerMeasurement.deleteMany({where:{tracker_id:{in:ids}}})
    if (ids.length) await db.trackerRevision.deleteMany({where:{tracker_id:{in:ids}}})
    if (ids.length) await db.trackerDefinition.deleteMany({where:{tracker_id:{in:ids}}})
    await db.$disconnect()
  })
  it('enforces one manual row and a revision belonging to its tracker',async()=>{
    const seed=async()=>{
      const row=await db.trackerDefinition.create({data:{name:'test',kind:'boolean',
        enabled_from:new Date('2026-09-01T00:00:00Z'),
        revisions:{create:{effective_from:new Date('2026-09-01T00:00:00Z'),config:{}}},
      },include:{revisions:true}})
      ids.push(row.tracker_id)
      return row
    }
    const first=await seed(),second=await seed()
    const value={tracker_id:first.tracker_id,revision_id:first.revisions[0].revision_id,
      local_date:new Date('2026-09-12T00:00:00Z'),origin:'manual',boolean_value:false}
    await db.trackerMeasurement.create({data:value})
    await expect(db.trackerMeasurement.create({data:value})).rejects.toMatchObject({code:'P2002'})
    await expect(db.trackerMeasurement.create({data:{...value,
      local_date:new Date('2026-09-13T00:00:00Z'),revision_id:second.revisions[0].revision_id,
    }})).rejects.toMatchObject({code:'P2003'})
  })
  it('rejects an actual measurement without a value and an invalid origin',async()=>{
    const row=await db.trackerDefinition.create({data:{name:'value test',kind:'boolean',
      enabled_from:new Date('2026-09-01T00:00:00Z'),
      revisions:{create:{effective_from:new Date('2026-09-01T00:00:00Z'),config:{}}},
    },include:{revisions:true}})
    ids.push(row.tracker_id)
    const value={tracker_id:row.tracker_id,revision_id:row.revisions[0].revision_id,
      local_date:new Date('2026-09-12T00:00:00Z'),origin:'manual'}
    await expect(db.trackerMeasurement.create({data:value})).rejects.toThrow(/TrackerMeasurement_value_check/)
    await expect(db.trackerMeasurement.create({data:{...value,boolean_value:true,origin:'invented'}}))
      .rejects.toThrow(/TrackerMeasurement_origin_check/)
  })
  it('rejects an inverted event range',async()=>{
    await expect(db.journalEvent.create({data:{title:'invalid range',
      start_date:new Date('2026-09-13T00:00:00Z'),end_date:new Date('2026-09-12T00:00:00Z'),
      request_id:crypto.randomUUID()}})).rejects.toThrow(/JournalEvent_valid_check/)
  })
})
