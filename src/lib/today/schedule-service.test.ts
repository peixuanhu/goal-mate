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
  is_recurring: false,
  estimated_minutes: 120,
  default_block_minutes: 60,
  actionItems: [{
    action_id: "action_copy",
    estimated_minutes: 60,
    is_completed: false,
  }],
  scheduleBlocks: [],
}

const action = {
  action_id: "action_copy",
  plan_id: "plan_launch",
  name: "写发布说明",
  energy_level: "medium",
  is_completed: false,
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

function createFingerprint(input: CreateScheduleBlockInput = validCreate): string {
  return createHash("sha256").update(JSON.stringify({
    plan_id: input.plan_id.trim(),
    action_id: input.action_id?.trim() ?? null,
    start_at: new Date(input.start_at).toISOString(),
    end_at: new Date(input.end_at).toISOString(),
    status: input.status ?? "scheduled",
    source: input.source ?? "manual",
  })).digest("hex")
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
  create_fingerprint: createFingerprint(),
  version: 1,
  plan,
  action,
}

function blockIdFor(key: string): string {
  return `block_${createHash("sha256").update(key).digest("hex").slice(0, 10)}`
}

function makeTxDb() {
  const db = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn(async (...call: unknown[]) => {
      const sql = rawSqlTemplate(call)
      if (sql.includes('FROM "Plan"')) return [{ plan_id: "plan_launch" }]
      if (sql.includes('FROM "ScheduleBlock"')) return [baseBlock]
      return [action]
    }),
    planningPreference: {
      findUnique: vi.fn().mockResolvedValue(preference),
    },
    plan: {
      findUnique: vi.fn().mockResolvedValue(plan),
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function prismaError(code: string, target?: string | string[]) {
  return {
    code,
    ...(target === undefined ? {} : { meta: { target } }),
  }
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
        create_fingerprint: createFingerprint(validCreate),
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
    ["sub-minute endpoint", {
      start_at: "2026-08-23T01:00:00.000Z",
      end_at: "2026-08-23T02:00:00.001Z",
    }, /整分钟/],
    ["off-slot local endpoints", {
      start_at: "2026-08-23T01:05:00.000Z",
      end_at: "2026-08-23T02:05:00.000Z",
    }, /15 分钟/],
  ])("rejects create with %s", async (_label, interval, message) => {
    const db = makeDb()

    await expect(createScheduleBlock(db, {
      ...validCreate,
      ...interval,
    })).rejects.toMatchObject({ code: "VALIDATION", message: expect.stringMatching(message) })
    expect(db.scheduleBlock.create).not.toHaveBeenCalled()
  })

  it.each([
    ["sub-minute endpoint", {
      start_at: "2026-08-23T03:00:00.001Z",
      end_at: "2026-08-23T04:00:00.000Z",
    }, /整分钟/],
    ["off-slot local endpoints", {
      start_at: "2026-08-23T03:05:00.000Z",
      end_at: "2026-08-23T04:05:00.000Z",
    }, /15 分钟/],
  ])("rejects update with %s", async (_label, interval, message) => {
    const db = makeDb()

    await expect(updateScheduleBlock(db, {
      block_id: "block_existing",
      expected_version: 1,
      ...interval,
    })).rejects.toMatchObject({ code: "VALIDATION", message: expect.stringMatching(message) })
    expect(db.scheduleBlock.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    ["a spring-forward wall-clock mismatch", {
      start_at: "2026-03-08T06:30:00.000Z",
      end_at: "2026-03-08T07:30:00.000Z",
    }, /夏令时转换/],
    ["an ambiguous fall-back endpoint", {
      start_at: "2026-11-01T05:30:00.000Z",
      end_at: "2026-11-01T05:45:00.000Z",
    }, /本地时间不明确/],
  ])("rejects create across %s", async (_label, interval, message) => {
    const db = makeDb()
    db.planningPreference.findUnique.mockResolvedValue({
      ...preference,
      timezone: "America/New_York",
      day_start_minutes: 0,
      day_end_minutes: 1440,
    })

    await expect(createScheduleBlock(db, {
      ...validCreate,
      idempotency_key: `dst-${interval.start_at}`,
      ...interval,
    })).rejects.toMatchObject({ code: "VALIDATION", message: expect.stringMatching(message) })
    expect(db.scheduleBlock.create).not.toHaveBeenCalled()
  })

  it("waits for the Plan FOR UPDATE query before requesting an Action lock or creating", async () => {
    const db = makeDb()
    const planLock = deferred<Array<{ plan_id: string }>>()
    let actionLockRequested = false
    db.$queryRaw.mockImplementation((...call: unknown[]) => {
      const sql = rawSqlTemplate(call)
      if (sql.includes('FROM "Plan"')) return planLock.promise
      actionLockRequested = true
      return Promise.resolve([action])
    })
    db.scheduleBlock.create.mockResolvedValue(createdBlock())

    const pending = createScheduleBlock(db, validCreate)
    await vi.waitFor(() => {
      expect(db.$queryRaw.mock.calls.some(call => rawSqlTemplate(call).includes('FROM "Plan"'))).toBe(true)
    })

    const planCall = db.$queryRaw.mock.calls.find(call => rawSqlTemplate(call).includes('FROM "Plan"'))
    expect(rawSqlTemplate(planCall ?? [])).toBe(
      'SELECT "plan_id" FROM "Plan" WHERE "plan_id" = ? FOR UPDATE',
    )
    expect(actionLockRequested).toBe(false)
    expect(db.scheduleBlock.create).not.toHaveBeenCalled()

    planLock.resolve([])
    await expect(pending).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(actionLockRequested).toBe(false)
    expect(db.scheduleBlock.create).not.toHaveBeenCalled()
  })

  it("waits for the ActionItem FOR UPDATE query and rejects a completion observed before create", async () => {
    const db = makeDb()
    const rowLock = deferred<Array<typeof action>>()
    db.$queryRaw.mockImplementation((...call: unknown[]) => (
      rawSqlTemplate(call).includes('FROM "Plan"')
        ? Promise.resolve([{ plan_id: "plan_launch" }])
        : rowLock.promise
    ))
    db.scheduleBlock.create.mockResolvedValue(createdBlock())

    const pending = createScheduleBlock(db, validCreate)
    await vi.waitFor(() => {
      expect(db.$queryRaw.mock.calls.some(call => rawSqlTemplate(call).includes('FROM "ActionItem"'))).toBe(true)
    })

    const actionCall = db.$queryRaw.mock.calls.find(call => rawSqlTemplate(call).includes('FROM "ActionItem"'))
    expect(rawSqlTemplate(actionCall ?? [])).toBe(
      'SELECT "action_id", "plan_id", "is_completed" FROM "ActionItem" WHERE "action_id" = ? FOR UPDATE',
    )
    expect(actionCall?.[1]).toBe("action_copy")
    expect(db.scheduleBlock.create).not.toHaveBeenCalled()

    rowLock.resolve([{ ...action, is_completed: true }])
    await expect(pending).rejects.toMatchObject({ code: "VALIDATION" })
    expect(db.scheduleBlock.create).not.toHaveBeenCalled()
  })

  it("waits for the ActionItem FOR UPDATE query after the block re-read and before update", async () => {
    const db = makeDb()
    const rowLock = deferred<Array<typeof action>>()
    const current = { ...baseBlock, block_id: "block_1" }
    db.$queryRaw.mockImplementation((...call: unknown[]) => {
      const sql = rawSqlTemplate(call)
      if (sql.includes('FROM "Plan"')) return Promise.resolve([{ plan_id: "plan_launch" }])
      if (sql.includes('FROM "ScheduleBlock"')) return Promise.resolve([current])
      return rowLock.promise
    })
    db.scheduleBlock.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({
        ...current,
        start_at: new Date("2026-08-23T03:00:00.000Z"),
        end_at: new Date("2026-08-23T04:00:00.000Z"),
        version: 2,
      })

    const pending = updateScheduleBlock(db, {
      block_id: "block_1",
      expected_version: 1,
      start_at: "2026-08-23T03:00:00.000Z",
      end_at: "2026-08-23T04:00:00.000Z",
    })
    await vi.waitFor(() => {
      expect(db.$queryRaw.mock.calls.some(call => rawSqlTemplate(call).includes('FROM "ActionItem"'))).toBe(true)
    })

    expect(db.scheduleBlock.findUnique).toHaveBeenCalledTimes(1)
    expect(db.scheduleBlock.updateMany).not.toHaveBeenCalled()
    rowLock.resolve([action])

    await expect(pending).resolves.toEqual(expect.objectContaining({ version: 2 }))
    expect(db.scheduleBlock.findUnique).toHaveBeenCalledTimes(2)
    expect(db.scheduleBlock.updateMany).toHaveBeenCalledOnce()
  })

  it("locks date, Plan, ScheduleBlock, then ActionItem before overlap and update", async () => {
    const db = makeDb()
    const events: string[] = []
    const current = { ...baseBlock, block_id: "block_1" }
    db.scheduleBlock.findUnique.mockResolvedValue(current)
    db.$executeRaw.mockImplementation(async (...call: unknown[]) => {
      if (call[1] === 48_241) events.push(`date:${String(call[2])}`)
      return 0
    })
    db.$queryRaw.mockImplementation(async (...call: unknown[]) => {
      const sql = rawSqlTemplate(call)
      if (sql.includes('FROM "Plan"')) {
        events.push("plan")
        return [{ plan_id: "plan_launch" }]
      }
      if (sql.includes('FROM "ScheduleBlock"')) {
        events.push("schedule")
        return [current]
      }
      events.push("action")
      return [action]
    })
    db.scheduleBlock.findMany.mockImplementation(async () => {
      events.push("overlap")
      return []
    })
    db.scheduleBlock.updateMany.mockImplementation(async () => {
      events.push("update")
      return { count: 1 }
    })

    await updateScheduleBlock(db, {
      block_id: "block_1",
      expected_version: 1,
      start_at: "2026-08-23T03:00:00.000Z",
      end_at: "2026-08-23T04:00:00.000Z",
    })

    expect(events).toEqual([
      "date:2026-08-23",
      "plan",
      "schedule",
      "action",
      "overlap",
      "update",
    ])
    expect(db.$queryRaw.mock.calls.map(rawSqlTemplate)).toEqual([
      'SELECT "plan_id" FROM "Plan" WHERE "plan_id" = ? FOR UPDATE',
      'SELECT "block_id", "plan_id", "action_id", "start_at", "end_at", "status", "version" FROM "ScheduleBlock" WHERE "block_id" = ? FOR UPDATE',
      'SELECT "action_id", "plan_id", "is_completed" FROM "ActionItem" WHERE "action_id" = ? FOR UPDATE',
    ])
  })

  it("returns STALE_VERSION before locking a completed Action on update", async () => {
    const db = makeDb()
    const snapshot = { ...baseBlock, block_id: "block_1" }
    let actionLockRequested = false
    db.scheduleBlock.findUnique.mockResolvedValue(snapshot)
    db.$queryRaw.mockImplementation(async (...call: unknown[]) => {
      const sql = rawSqlTemplate(call)
      if (sql.includes('FROM "Plan"')) return [{ plan_id: "plan_launch" }]
      if (sql.includes('FROM "ScheduleBlock"')) return [{ ...snapshot, version: 2 }]
      actionLockRequested = true
      return [{ ...action, is_completed: true }]
    })

    await expect(updateScheduleBlock(db, {
      block_id: "block_1",
      expected_version: 1,
      start_at: "2026-08-23T03:00:00.000Z",
      end_at: "2026-08-23T04:00:00.000Z",
    })).rejects.toMatchObject({ code: "STALE_VERSION" })
    expect(actionLockRequested).toBe(false)
    expect(db.scheduleBlock.updateMany).not.toHaveBeenCalled()
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

  it("updates at max-2 and leaves one terminal mutation version", async () => {
    const db = makeDb()
    const current = { ...baseBlock, block_id: "block_1", version: 2_147_483_645 }
    const refreshed = {
      ...current,
      start_at: new Date("2026-08-23T03:00:00.000Z"),
      end_at: new Date("2026-08-23T04:00:00.000Z"),
      version: 2_147_483_646,
    }
    db.scheduleBlock.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(refreshed)
    db.$queryRaw.mockImplementation(async (...call: unknown[]) => {
      const sql = rawSqlTemplate(call)
      if (sql.includes('FROM "Plan"')) return [{ plan_id: "plan_launch" }]
      if (sql.includes('FROM "ScheduleBlock"')) return [current]
      return [action]
    })

    const result = await updateScheduleBlock(db, {
      block_id: "block_1",
      expected_version: 2_147_483_645,
      start_at: "2026-08-23T03:00:00.000Z",
      end_at: "2026-08-23T04:00:00.000Z",
    })

    expect(db.scheduleBlock.updateMany).toHaveBeenCalledWith({
      where: { block_id: "block_1", version: 2_147_483_645, status: "scheduled" },
      data: {
        start_at: new Date("2026-08-23T03:00:00.000Z"),
        end_at: new Date("2026-08-23T04:00:00.000Z"),
        version: { increment: 1 },
      },
    })
    expect(result.version).toBe(2_147_483_646)
  })

  it.each([2_147_483_646, 2_147_483_647, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY])(
    "rejects update version %s before opening a transaction",
    async version => {
      const db = makeDb()

      await expect(updateScheduleBlock(db, {
        block_id: "block_1",
        expected_version: version,
        start_at: "2026-08-23T03:00:00.000Z",
        end_at: "2026-08-23T04:00:00.000Z",
      })).rejects.toMatchObject({ code: "VALIDATION" })
      expect(db.$transaction).not.toHaveBeenCalled()
      expect(db.scheduleBlock.updateMany).not.toHaveBeenCalled()
    },
  )

  it("cancels at max-1 and writes a terminal max version", async () => {
    const db = makeDb()
    const current = { ...baseBlock, block_id: "block_1", version: 2_147_483_646 }
    db.scheduleBlock.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ ...current, status: "cancelled", version: 2_147_483_647 })

    const result = await cancelScheduleBlock(
      db,
      { block_id: "block_1", expected_version: 2_147_483_646 },
      { now: new Date("2026-08-23T00:59:59.999Z") },
    )

    expect(db.scheduleBlock.updateMany).toHaveBeenCalledWith({
      where: { block_id: "block_1", version: 2_147_483_646, status: "scheduled" },
      data: { status: "cancelled", version: { increment: 1 } },
    })
    expect(result.version).toBe(2_147_483_647)
  })

  it.each([2_147_483_647, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY])(
    "rejects terminal version %s before opening a transaction",
    async version => {
      const db = makeDb()

      await expect(cancelScheduleBlock(db, {
        block_id: "block_1",
        expected_version: version,
      })).rejects.toMatchObject({ code: "VALIDATION" })
      expect(db.$transaction).not.toHaveBeenCalled()
      expect(db.scheduleBlock.updateMany).not.toHaveBeenCalled()
    },
  )

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

    await expect(createScheduleBlock(collisionDb, {
      ...validCreate,
      plan_id: "plan_other",
    })).rejects.toMatchObject({
      code: "SCHEDULE_CONFLICT",
      conflictIds: [blockIdFor(validCreate.idempotency_key)],
    })
  })

  it("returns an identical direct-block retry before checking for an active direct block", async () => {
    const db = makeDb()
    const directCreate = {
      ...validCreate,
      idempotency_key: "schedule-plan-v1",
      action_id: null,
    }
    db.scheduleBlock.findUnique.mockResolvedValue({
      ...createdBlock(directCreate.idempotency_key),
      action_id: null,
      action: null,
      create_fingerprint: createFingerprint(directCreate),
    })

    await expect(createScheduleBlock(db, directCreate)).resolves.toEqual(
      expect.objectContaining({ block_id: blockIdFor(directCreate.idempotency_key) }),
    )
    expect(db.scheduleBlock.findFirst).not.toHaveBeenCalled()
    expect(db.scheduleBlock.create).not.toHaveBeenCalled()
  })

  it("returns the current moved block when retrying its original durable create payload", async () => {
    const db = makeDb()
    db.scheduleBlock.findUnique.mockResolvedValue({
      ...createdBlock(),
      start_at: new Date("2026-08-24T01:00:00.000Z"),
      end_at: new Date("2026-08-24T02:00:00.000Z"),
      status: "cancelled",
      version: 4,
      create_fingerprint: createFingerprint(validCreate),
    })

    await expect(createScheduleBlock(db, validCreate)).resolves.toEqual(expect.objectContaining({
      start_at: "2026-08-24T01:00:00.000Z",
      end_at: "2026-08-24T02:00:00.000Z",
      status: "cancelled",
      version: 4,
    }))
    expect(db.scheduleBlock.create).not.toHaveBeenCalled()
  })

  it("rejects a reused key when the request matches current mutable fields but not the original fingerprint", async () => {
    const db = makeDb()
    const changedPayload = {
      ...validCreate,
      start_at: "2026-08-24T01:00:00.000Z",
      end_at: "2026-08-24T02:00:00.000Z",
    }
    db.scheduleBlock.findUnique.mockResolvedValue({
      ...createdBlock(),
      start_at: new Date(changedPayload.start_at),
      end_at: new Date(changedPayload.end_at),
      create_fingerprint: createFingerprint(validCreate),
    })

    await expect(createScheduleBlock(db, changedPayload)).rejects.toMatchObject({
      code: "SCHEDULE_CONFLICT",
      conflictIds: [blockIdFor(validCreate.idempotency_key)],
    })
  })

  it("conservatively accepts and fingerprints a legacy null row only when its current create fields match", async () => {
    const db = makeDb()
    db.scheduleBlock.findUnique.mockResolvedValue({
      ...createdBlock(),
      create_fingerprint: null,
    })

    await expect(createScheduleBlock(db, validCreate)).resolves.toEqual(
      expect.objectContaining({ block_id: blockIdFor(validCreate.idempotency_key) }),
    )
    expect(db.scheduleBlock.updateMany).toHaveBeenCalledWith({
      where: {
        block_id: blockIdFor(validCreate.idempotency_key),
        create_fingerprint: null,
        plan_id: "plan_launch",
        action_id: "action_copy",
        start_at: new Date("2026-08-23T01:00:00.000Z"),
        end_at: new Date("2026-08-23T02:00:00.000Z"),
        status: "scheduled",
        source: "manual",
      },
      data: { create_fingerprint: createFingerprint(validCreate) },
    })
  })

  it("conservatively rejects a legacy null row when current create fields differ", async () => {
    const db = makeDb()
    db.scheduleBlock.findUnique.mockResolvedValue({
      ...createdBlock(),
      end_at: new Date("2026-08-23T03:00:00.000Z"),
      create_fingerprint: null,
    })

    await expect(createScheduleBlock(db, validCreate)).rejects.toMatchObject({
      code: "SCHEDULE_CONFLICT",
    })
    expect(db.scheduleBlock.updateMany).not.toHaveBeenCalled()
  })

  it("keeps a block_id unique collision mapped to SCHEDULE_CONFLICT", async () => {
    const db = makeDb()
    db.$transaction.mockRejectedValue(prismaError("P2002", ["block_id"]))

    await expect(createScheduleBlock(db, validCreate)).rejects.toMatchObject({
      code: "SCHEDULE_CONFLICT",
      conflictIds: [blockIdFor(validCreate.idempotency_key)],
    })
    expect(db.scheduleBlock.findFirst).not.toHaveBeenCalled()
  })

  it("maps a deadlock or serialization retry to SCHEDULE_CONFLICT", async () => {
    const db = makeDb()
    db.$transaction.mockRejectedValue(prismaError("P2034"))

    await expect(createScheduleBlock(db, validCreate)).rejects.toMatchObject({
      code: "SCHEDULE_CONFLICT",
    })
  })

  it("maps an update transaction deadlock or serialization failure to SCHEDULE_CONFLICT", async () => {
    const db = makeDb()
    db.$transaction.mockRejectedValue(prismaError("P2034"))

    await expect(updateScheduleBlock(db, {
      block_id: "block_1",
      expected_version: 1,
      start_at: "2026-08-23T03:00:00.000Z",
      end_at: "2026-08-23T04:00:00.000Z",
    })).rejects.toMatchObject({
      code: "SCHEDULE_CONFLICT",
    })
  })

  it("maps a cancel transaction deadlock or serialization failure to SCHEDULE_CONFLICT", async () => {
    const db = makeDb()
    db.$transaction.mockRejectedValue(prismaError("P2034"))

    await expect(cancelScheduleBlock(db, {
      block_id: "block_1",
      expected_version: 1,
    })).rejects.toMatchObject({
      code: "SCHEDULE_CONFLICT",
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

    expect(db.$queryRaw).toHaveBeenCalledOnce()
    expect(rawSqlTemplate(db.$queryRaw.mock.calls[0])).toBe(
      'SELECT "plan_id" FROM "Plan" WHERE "plan_id" = ? FOR UPDATE',
    )
    expect(db.scheduleBlock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action_id: null }),
    }))
  })

  it("allows a second non-overlapping active direct block within the Plan budget", async () => {
    const db = makeDb()
    db.scheduleBlock.findFirst.mockResolvedValue({ block_id: "block_existing" })
    db.plan.findUnique.mockResolvedValue({
      ...plan,
      estimated_minutes: 120,
      actionItems: [],
      scheduleBlocks: [{
        block_id: "block_existing",
        action_id: null,
        start_at: new Date("2026-08-23T03:00:00.000Z"),
        end_at: new Date("2026-08-23T04:00:00.000Z"),
        status: "scheduled",
      }],
    })
    db.scheduleBlock.create.mockResolvedValue({
      ...createdBlock(),
      action_id: null,
      action: null,
    })

    await expect(createScheduleBlock(db, { ...validCreate, action_id: null })).resolves.toEqual(
      expect.objectContaining({ action_id: null }),
    )
  })

  it("rejects a missing Plan, mismatched Action, and completed Action", async () => {
    const missingPlanDb = makeDb()
    missingPlanDb.$queryRaw.mockResolvedValue([])
    await expect(createScheduleBlock(missingPlanDb, validCreate)).rejects.toMatchObject({ code: "NOT_FOUND" })

    const mismatchedDb = makeDb()
    mismatchedDb.$queryRaw.mockResolvedValue([{ ...action, plan_id: "plan_other" }])
    await expect(createScheduleBlock(mismatchedDb, validCreate)).rejects.toMatchObject({ code: "VALIDATION" })

    const completedDb = makeDb()
    completedDb.$queryRaw.mockResolvedValue([{ ...action, is_completed: true }])
    await expect(createScheduleBlock(completedDb, validCreate)).rejects.toMatchObject({ code: "VALIDATION" })
  })

  it("allows a second non-overlapping active block for the same Action within budget", async () => {
    const db = makeDb()
    db.scheduleBlock.findFirst.mockResolvedValue({ block_id: "block_action_busy" })
    db.plan.findUnique.mockResolvedValue({
      ...plan,
      estimated_minutes: 180,
      actionItems: [{
        action_id: "action_copy",
        estimated_minutes: 120,
        is_completed: false,
      }],
      scheduleBlocks: [{
        block_id: "block_action_busy",
        action_id: "action_copy",
        start_at: new Date("2026-08-23T03:00:00.000Z"),
        end_at: new Date("2026-08-23T04:00:00.000Z"),
        status: "scheduled",
      }],
    })
    db.scheduleBlock.create.mockResolvedValue(createdBlock())

    await expect(createScheduleBlock(db, validCreate)).resolves.toEqual(
      expect.objectContaining({ action_id: "action_copy" }),
    )
  })

  it("rejects an Action block that exceeds its remaining schedulable budget", async () => {
    const db = makeDb()
    db.plan.findUnique.mockResolvedValue({
      ...plan,
      actionItems: [{
        action_id: "action_copy",
        estimated_minutes: 60,
        is_completed: false,
      }],
      scheduleBlocks: [{
        block_id: "block_action_busy",
        action_id: "action_copy",
        start_at: new Date("2026-08-23T03:00:00.000Z"),
        end_at: new Date("2026-08-23T03:30:00.000Z"),
        status: "scheduled",
      }],
    })

    await expect(createScheduleBlock(db, validCreate)).rejects.toMatchObject({
      code: "SCHEDULE_BUDGET_EXCEEDED",
      message: "时间块超过剩余可安排时间",
    })
    expect(db.scheduleBlock.create).not.toHaveBeenCalled()
  })

  it("updates an active direct block without treating the block itself as a duplicate", async () => {
    const db = makeDb()
    const current = {
      ...baseBlock,
      block_id: "block_direct",
      action_id: null,
      action: null,
    }
    const refreshed = {
      ...current,
      start_at: new Date("2026-08-23T03:00:00.000Z"),
      end_at: new Date("2026-08-23T04:00:00.000Z"),
      version: 2,
    }
    db.scheduleBlock.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(refreshed)
    db.$queryRaw.mockImplementation(async (...call: unknown[]) => (
      rawSqlTemplate(call).includes('FROM "ScheduleBlock"') ? [current] : [{ plan_id: "plan_launch" }]
    ))

    await expect(updateScheduleBlock(db, {
      block_id: "block_direct",
      expected_version: 1,
      start_at: "2026-08-23T03:00:00.000Z",
      end_at: "2026-08-23T04:00:00.000Z",
    })).resolves.toEqual(expect.objectContaining({ block_id: "block_direct", version: 2 }))
    expect(db.scheduleBlock.findFirst).not.toHaveBeenCalled()
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
    db.$executeRaw.mockImplementation(async (...call: unknown[]) => {
      if (call[1] === 48_241) {
        events.push(`date:${String(call[2])}`)
      }
      return 0
    })
    db.scheduleBlock.findMany.mockImplementation(async () => {
      events.push("overlap")
      return []
    })
    db.scheduleBlock.create.mockResolvedValue(createdBlock())

    await createScheduleBlock(db, validCreate)

    const dateLockCalls = db.$executeRaw.mock.calls.filter(call => call[1] === 48_241)
    expect(dateLockCalls).toHaveLength(1)
    expect(rawSqlTemplate(dateLockCalls[0])).toBe(
      "SELECT pg_advisory_xact_lock(?::int, hashtext(?)::int)",
    )
    expect(dateLockCalls[0][2]).toBe("2026-08-23")
    expect(events).toEqual(["date:2026-08-23", "overlap"])
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

  it("makes reverse cross-date updates request the same sorted date locks before overlap", async () => {
    const dbA = makeDb()
    const dbB = makeDb()
    const releaseBFirstDate = deferred<void>()
    const bReachedFirstDate = deferred<void>()
    const eventsA: string[] = []
    const eventsB: string[] = []
    const currentA = { ...baseBlock, block_id: "block_a" }
    const currentB = {
      ...baseBlock,
      block_id: "block_b",
      start_at: new Date("2026-08-24T03:00:00.000Z"),
      end_at: new Date("2026-08-24T04:00:00.000Z"),
    }
    dbA.scheduleBlock.findUnique
      .mockResolvedValueOnce(currentA)
      .mockResolvedValueOnce({
        ...currentA,
        start_at: new Date("2026-08-24T01:00:00.000Z"),
        end_at: new Date("2026-08-24T02:00:00.000Z"),
        version: 2,
      })
    dbB.scheduleBlock.findUnique
      .mockResolvedValueOnce(currentB)
      .mockResolvedValueOnce({
        ...currentB,
        start_at: new Date("2026-08-23T03:00:00.000Z"),
        end_at: new Date("2026-08-23T04:00:00.000Z"),
        version: 2,
      })
    dbA.$executeRaw.mockImplementation(async (...call: unknown[]) => {
      if (call[1] !== 48_241) return 0
      const date = String(call[2])
      eventsA.push(`date:${date}`)
      if (date === "2026-08-24") {
        await bReachedFirstDate.promise
      }
      return 0
    })
    dbB.$executeRaw.mockImplementation(async (...call: unknown[]) => {
      if (call[1] !== 48_241) return 0
      const date = String(call[2])
      eventsB.push(`date:${date}`)
      if (date === "2026-08-23") {
        bReachedFirstDate.resolve(undefined)
        await releaseBFirstDate.promise
      }
      return 0
    })
    dbA.scheduleBlock.findMany.mockImplementation(async () => {
      eventsA.push("overlap")
      return []
    })
    dbB.scheduleBlock.findMany.mockImplementation(async () => {
      eventsB.push("overlap")
      return []
    })

    const updateA = updateScheduleBlock(dbA, {
      block_id: "block_a",
      expected_version: 1,
      start_at: "2026-08-24T01:00:00.000Z",
      end_at: "2026-08-24T02:00:00.000Z",
    })
    const updateB = updateScheduleBlock(dbB, {
      block_id: "block_b",
      expected_version: 1,
      start_at: "2026-08-23T03:00:00.000Z",
      end_at: "2026-08-23T04:00:00.000Z",
    })

    await expect(updateA).resolves.toEqual(expect.objectContaining({ version: 2 }))
    expect(eventsA).toEqual(["date:2026-08-23", "date:2026-08-24", "overlap"])
    expect(eventsB).toEqual(["date:2026-08-23"])
    expect(dbB.scheduleBlock.findMany).not.toHaveBeenCalled()

    releaseBFirstDate.resolve(undefined)
    await expect(updateB).resolves.toEqual(expect.objectContaining({ version: 2 }))
    expect(eventsB).toEqual(["date:2026-08-23", "date:2026-08-24", "overlap"])
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
