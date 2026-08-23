import { createHash } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  cancelScheduleBlock as cancelScheduleBlockService,
  createScheduleBlock as createScheduleBlockService,
  updateScheduleBlock as updateScheduleBlockService,
  type CancelScheduleBlockInput,
  type CreateScheduleBlockInput,
  type UpdateScheduleBlockInput,
} from "./schedule-service"

const preference = {
  preference_id: "default",
  timezone: "Asia/Shanghai",
  day_start_minutes: 480,
  day_end_minutes: 1320,
  high_energy_start_minutes: null,
  high_energy_end_minutes: null,
  buffer_minutes: 15,
  default_block_minutes: 60,
  capacity_warning_minutes: 480,
  gmt_modified: new Date("2026-08-23T00:00:00.000Z"),
}

const plan = {
  plan_id: "plan_launch",
  name: "准备发布",
  energy_level: "high",
  goal: { goal_id: "goal_product", name: "发布 Goal Mate v1" },
}

const action = {
  action_id: "action_copy",
  plan_id: "plan_launch",
  name: "写发布说明",
  energy_level: "medium",
  is_completed: false,
}

const baseBlock = {
  block_id: "block_existing",
  plan_id: "plan_launch",
  action_id: "action_copy",
  start_at: new Date("2026-08-23T01:00:00.000Z"),
  end_at: new Date("2026-08-23T02:00:00.000Z"),
  status: "scheduled",
  source: "manual",
  result_note: null,
  version: 1,
  plan,
  action,
}

const validCreate = {
  idempotency_key: "schedule-copy-v1",
  plan_id: "plan_launch",
  action_id: "action_copy",
  start_at: "2026-08-23T01:00:00.000Z",
  end_at: "2026-08-23T02:00:00.000Z",
  source: "manual" as const,
  status: "scheduled" as const,
}

function blockIdFor(key: string): string {
  return `block_${createHash("sha256").update(key).digest("hex").slice(0, 10)}`
}

function makeTxDb() {
  const db = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    planningPreference: {
      findUnique: vi.fn().mockResolvedValue(preference),
    },
    plan: {
      findUnique: vi.fn().mockResolvedValue(plan),
    },
    actionItem: {
      findUnique: vi.fn().mockResolvedValue(action),
    },
    scheduleBlock: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }
  return db
}

type MockTxDb = ReturnType<typeof makeTxDb>
type MockRootDb = MockTxDb & {
  $transaction: ReturnType<typeof vi.fn>
}
type ServiceDb = Parameters<typeof createScheduleBlockService>[0]

function makeDb(): MockRootDb
function makeDb(options: { root: false }): MockTxDb
function makeDb(options: { root?: boolean } = {}): MockRootDb | MockTxDb {
  const db = makeTxDb()
  return options.root === false
    ? db
    : {
        ...db,
        $transaction: vi.fn(async (callback: (tx: MockTxDb) => unknown) => callback(db)),
      }
}

function createScheduleBlock(db: MockRootDb | MockTxDb, input: CreateScheduleBlockInput) {
  return createScheduleBlockService(db as unknown as ServiceDb, input)
}

function updateScheduleBlock(db: MockRootDb | MockTxDb, input: UpdateScheduleBlockInput) {
  return updateScheduleBlockService(db as unknown as ServiceDb, input)
}

function cancelScheduleBlock(
  db: MockRootDb | MockTxDb,
  input: CancelScheduleBlockInput,
  options?: { now?: Date },
) {
  return cancelScheduleBlockService(db as unknown as ServiceDb, input, options)
}

function createdBlock(key = validCreate.idempotency_key) {
  return {
    ...baseBlock,
    block_id: blockIdFor(key),
  }
}

function rawSqlTemplate(call: unknown[]): string {
  const template = call[0]
  return Array.isArray(template) ? template.join("?") : ""
}

describe("ScheduleBlock service", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("creates an action block with a deterministic id and normalized view", async () => {
    const db = makeDb()
    const created = createdBlock()
    db.scheduleBlock.create.mockResolvedValue(created)

    const result = await createScheduleBlock(db, validCreate)

    expect(db.$transaction).toHaveBeenCalledOnce()
    expect(db.scheduleBlock.create).toHaveBeenCalledWith({
      data: {
        block_id: blockIdFor(validCreate.idempotency_key),
        plan_id: "plan_launch",
        action_id: "action_copy",
        start_at: new Date("2026-08-23T01:00:00.000Z"),
        end_at: new Date("2026-08-23T02:00:00.000Z"),
        status: "scheduled",
        source: "manual",
      },
      include: expect.any(Object),
    })
    expect(result).toEqual({
      block_id: blockIdFor(validCreate.idempotency_key),
      plan_id: "plan_launch",
      action_id: "action_copy",
      title: "写发布说明",
      goal_id: "goal_product",
      goal_name: "发布 Goal Mate v1",
      energy_level: "medium",
      start_at: "2026-08-23T01:00:00.000Z",
      end_at: "2026-08-23T02:00:00.000Z",
      status: "scheduled",
      source: "manual",
      result_note: null,
      version: 1,
    })
  })

  it.each([
    ["missing", ""],
    ["oversized", "x".repeat(129)],
  ])("rejects a %s idempotency key before opening a transaction", async (_label, key) => {
    const db = makeDb()

    await expect(createScheduleBlock(db, { ...validCreate, idempotency_key: key })).rejects.toMatchObject({
      code: "VALIDATION",
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it("returns an identical retry and rejects a key collision with different immutable content", async () => {
    const identicalDb = makeDb()
    identicalDb.scheduleBlock.findUnique.mockResolvedValue(createdBlock())

    await expect(createScheduleBlock(identicalDb, validCreate)).resolves.toEqual(
      expect.objectContaining({ block_id: blockIdFor(validCreate.idempotency_key) }),
    )
    expect(identicalDb.scheduleBlock.create).not.toHaveBeenCalled()

    const collisionDb = makeDb()
    collisionDb.scheduleBlock.findUnique.mockResolvedValue({
      ...createdBlock(),
      end_at: new Date("2026-08-23T03:00:00.000Z"),
    })

    await expect(createScheduleBlock(collisionDb, validCreate)).rejects.toMatchObject({
      code: "SCHEDULE_CONFLICT",
      conflictIds: [blockIdFor(validCreate.idempotency_key)],
    })
  })

  it("allows a direct parent-Plan block even when the Plan has open Actions", async () => {
    const db = makeDb()
    db.scheduleBlock.create.mockResolvedValue({
      ...createdBlock(),
      action_id: null,
      action: null,
    })

    await createScheduleBlock(db, { ...validCreate, action_id: null })

    expect(db.actionItem.findUnique).not.toHaveBeenCalled()
    expect(db.scheduleBlock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action_id: null }),
    }))
  })

  it("rejects a missing Plan, mismatched Action, and completed Action", async () => {
    const missingPlanDb = makeDb()
    missingPlanDb.plan.findUnique.mockResolvedValue(null)
    await expect(createScheduleBlock(missingPlanDb, validCreate)).rejects.toMatchObject({ code: "NOT_FOUND" })

    const mismatchedDb = makeDb()
    mismatchedDb.actionItem.findUnique.mockResolvedValue({ ...action, plan_id: "plan_other" })
    await expect(createScheduleBlock(mismatchedDb, validCreate)).rejects.toMatchObject({ code: "VALIDATION" })

    const completedDb = makeDb()
    completedDb.actionItem.findUnique.mockResolvedValue({ ...action, is_completed: true })
    await expect(createScheduleBlock(completedDb, validCreate)).rejects.toMatchObject({ code: "VALIDATION" })
  })

  it("rejects a second active scheduled block for the same Action", async () => {
    const db = makeDb()
    db.scheduleBlock.findFirst.mockResolvedValue({ block_id: "block_action_busy" })

    await expect(createScheduleBlock(db, validCreate)).rejects.toMatchObject({
      code: "ACTION_ALREADY_SCHEDULED",
      conflictIds: ["block_action_busy"],
    })
  })

  it("allows touching intervals but returns overlap ids for half-open conflicts", async () => {
    const touchingDb = makeDb()
    touchingDb.scheduleBlock.findMany.mockResolvedValue([{
      block_id: "touching",
      start_at: new Date("2026-08-23T00:00:00.000Z"),
      end_at: new Date("2026-08-23T01:00:00.000Z"),
      status: "scheduled",
    }])
    touchingDb.scheduleBlock.create.mockResolvedValue(createdBlock())

    await expect(createScheduleBlock(touchingDb, validCreate)).resolves.toEqual(expect.any(Object))

    const overlappingDb = makeDb()
    overlappingDb.scheduleBlock.findMany.mockResolvedValue([{
      block_id: "busy",
      start_at: new Date("2026-08-23T01:30:00.000Z"),
      end_at: new Date("2026-08-23T02:30:00.000Z"),
      status: "completed",
    }])

    await expect(createScheduleBlock(overlappingDb, validCreate)).rejects.toMatchObject({
      code: "SCHEDULE_CONFLICT",
      conflictIds: ["busy"],
    })
  })

  it.each([
    ["invalid ISO", { start_at: "2026-08-23" }],
    ["invalid source", { source: "calendar" }],
    ["invalid status", { status: "completed" }],
    ["before day start", { start_at: "2026-08-22T23:00:00.000Z", end_at: "2026-08-23T00:00:00.000Z" }],
    ["after day end", { start_at: "2026-08-23T13:00:00.000Z", end_at: "2026-08-23T15:00:00.000Z" }],
  ])("rejects %s using the stored timezone and day bounds", async (_label, override) => {
    const db = makeDb()

    await expect(createScheduleBlock(db, { ...validCreate, ...override } as typeof validCreate)).rejects.toMatchObject({
      code: "VALIDATION",
    })
    expect(db.scheduleBlock.create).not.toHaveBeenCalled()
  })

  it("rejects an end instant even one millisecond beyond the configured day end", async () => {
    const db = makeDb()
    db.scheduleBlock.create.mockResolvedValue({
      ...createdBlock(),
      start_at: new Date("2026-08-23T13:00:00.000Z"),
      end_at: new Date("2026-08-23T14:00:00.001Z"),
    })

    await expect(createScheduleBlock(db, {
      ...validCreate,
      start_at: "2026-08-23T13:00:00.000Z",
      end_at: "2026-08-23T14:00:00.001Z",
    })).rejects.toMatchObject({ code: "VALIDATION" })
    expect(db.scheduleBlock.create).not.toHaveBeenCalled()
  })

  it("allows an end exactly at the next real local midnight when day_end is 1440", async () => {
    const db = makeDb()
    db.planningPreference.findUnique.mockResolvedValue({ ...preference, day_end_minutes: 1440 })
    db.scheduleBlock.create.mockResolvedValue({
      ...createdBlock(),
      start_at: new Date("2026-08-23T15:00:00.000Z"),
      end_at: new Date("2026-08-23T16:00:00.000Z"),
    })

    await expect(createScheduleBlock(db, {
      ...validCreate,
      start_at: "2026-08-23T15:00:00.000Z",
      end_at: "2026-08-23T16:00:00.000Z",
    })).resolves.toEqual(expect.objectContaining({
      end_at: "2026-08-23T16:00:00.000Z",
    }))
  })

  it("uses the stored preference rather than a client timezone field", async () => {
    const db = makeDb()

    await expect(createScheduleBlock(db, {
      ...validCreate,
      timezone: "America/New_York",
    } as typeof validCreate)).rejects.toMatchObject({ code: "VALIDATION" })
    expect(db.planningPreference.findUnique).not.toHaveBeenCalled()
  })

  it("owns a transaction for a root client and reuses an existing transaction client", async () => {
    const rootDb = makeDb()
    rootDb.scheduleBlock.create.mockResolvedValue(createdBlock())
    await createScheduleBlock(rootDb, validCreate)
    expect(rootDb.$transaction).toHaveBeenCalledOnce()

    const txDb = makeDb({ root: false })
    txDb.scheduleBlock.create.mockResolvedValue(createdBlock())
    await createScheduleBlock(txDb, validCreate)
    expect(txDb).not.toHaveProperty("$transaction")
    expect(txDb.scheduleBlock.create).toHaveBeenCalledOnce()
  })

  it("acquires the affected local-date advisory lock before checking overlaps", async () => {
    const events: string[] = []
    const db = makeDb()
    db.$executeRaw.mockImplementation(async () => {
      events.push("lock")
      return 0
    })
    db.scheduleBlock.findMany.mockImplementation(async () => {
      events.push("overlap")
      return []
    })
    db.scheduleBlock.create.mockResolvedValue(createdBlock())

    await createScheduleBlock(db, validCreate)

    expect(events).toEqual(expect.arrayContaining(["lock", "overlap"]))
    expect(events.indexOf("lock")).toBeLessThan(events.indexOf("overlap"))
    expect(db.$executeRaw.mock.calls.some(call => call.includes("2026-08-23"))).toBe(true)
  })

  it("locks old and new local dates in sorted order before a cross-date update", async () => {
    const db = makeDb()
    const current = { ...baseBlock, block_id: "block_1" }
    db.scheduleBlock.findUnique.mockResolvedValue(current)
    db.scheduleBlock.findMany.mockResolvedValue([])
    db.scheduleBlock.updateMany.mockResolvedValue({ count: 1 })
    db.scheduleBlock.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({
        ...current,
        start_at: new Date("2026-08-24T01:00:00.000Z"),
        end_at: new Date("2026-08-24T02:00:00.000Z"),
        version: 2,
      })

    await updateScheduleBlock(db, {
      block_id: "block_1",
      expected_version: 1,
      start_at: "2026-08-24T01:00:00.000Z",
      end_at: "2026-08-24T02:00:00.000Z",
    })

    const dateLocks = db.$executeRaw.mock.calls
      .filter(call => rawSqlTemplate(call).includes("pg_advisory_xact_lock") && call.some(value => /^2026-/.test(String(value))))
      .map(call => call.find(value => /^2026-/.test(String(value))))
    expect(dateLocks).toEqual(["2026-08-23", "2026-08-24"])
    expect(db.scheduleBlock.updateMany).toHaveBeenCalledWith({
      where: { block_id: "block_1", version: 1, status: "scheduled" },
      data: {
        start_at: new Date("2026-08-24T01:00:00.000Z"),
        end_at: new Date("2026-08-24T02:00:00.000Z"),
        version: { increment: 1 },
      },
    })
  })

  it("rejects stale edits through versioned updateMany", async () => {
    const db = makeDb()
    db.scheduleBlock.findUnique.mockResolvedValue({ ...baseBlock, block_id: "block_1" })
    db.scheduleBlock.updateMany.mockResolvedValue({ count: 0 })

    await expect(updateScheduleBlock(db, {
      block_id: "block_1",
      expected_version: 1,
      start_at: "2026-08-23T03:00:00.000Z",
      end_at: "2026-08-23T04:00:00.000Z",
    })).rejects.toMatchObject({ code: "STALE_VERSION" })
  })

  it("cancel reads, locks its current local date, re-reads, then marks a future block cancelled", async () => {
    const events: string[] = []
    const db = makeDb()
    const future = { ...baseBlock, block_id: "block_1" }
    db.scheduleBlock.findUnique
      .mockImplementationOnce(async () => {
        events.push("read")
        return future
      })
      .mockImplementationOnce(async () => {
        events.push("reread")
        return future
      })
      .mockImplementationOnce(async () => ({ ...future, status: "cancelled", version: 2 }))
    db.$executeRaw.mockImplementation(async () => {
      events.push("lock")
      return 0
    })

    const result = await cancelScheduleBlock(
      db,
      { block_id: "block_1", expected_version: 1 },
      { now: new Date("2026-08-23T00:59:59.999Z") },
    )

    expect(events.slice(0, 3)).toEqual(["read", "lock", "reread"])
    expect(db.scheduleBlock.updateMany).toHaveBeenCalledWith({
      where: { block_id: "block_1", version: 1, status: "scheduled" },
      data: { status: "cancelled", version: { increment: 1 } },
    })
    expect(result).toEqual(expect.objectContaining({ status: "cancelled", version: 2 }))
    expect(db.scheduleBlock).not.toHaveProperty("delete")
  })

  it("rejects cancellation once start_at is equal to now and detects stale re-reads", async () => {
    const startedDb = makeDb()
    startedDb.scheduleBlock.findUnique.mockResolvedValue({ ...baseBlock, block_id: "block_1" })
    await expect(cancelScheduleBlock(
      startedDb,
      { block_id: "block_1", expected_version: 1 },
      { now: new Date("2026-08-23T01:00:00.000Z") },
    )).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT" })
    expect(startedDb.scheduleBlock.updateMany).not.toHaveBeenCalled()

    const staleDb = makeDb()
    staleDb.scheduleBlock.findUnique
      .mockResolvedValueOnce({ ...baseBlock, block_id: "block_1" })
      .mockResolvedValueOnce({ ...baseBlock, block_id: "block_1", version: 2 })
    await expect(cancelScheduleBlock(
      staleDb,
      { block_id: "block_1", expected_version: 1 },
      { now: new Date("2026-08-23T00:00:00.000Z") },
    )).rejects.toMatchObject({ code: "STALE_VERSION" })
  })
})
