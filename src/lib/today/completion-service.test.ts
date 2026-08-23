import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  completeScheduleBlock as completeScheduleBlockService,
  type CompleteScheduleBlockInput,
} from "./completion-service"

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

const snapshot: {
  block_id: string
  plan_id: string
  action_id: string | null
  start_at: Date
} = {
  block_id: "block_copy",
  plan_id: "plan_launch",
  action_id: "action_copy",
  start_at: new Date("2026-08-23T01:00:00.000Z"),
}

function completedBlock(overrides: Record<string, unknown> = {}) {
  return {
    ...snapshot,
    end_at: new Date("2026-08-23T02:00:00.000Z"),
    status: "completed",
    source: "manual",
    result_note: "发布完成",
    create_fingerprint: "fingerprint",
    version: 2,
    plan,
    action: { ...action, is_completed: true },
    ...overrides,
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

function makeTxDb(options: { recurring?: boolean; refreshed?: ReturnType<typeof completedBlock> } = {}) {
  const refreshed = options.refreshed ?? completedBlock()
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn(async (...call: unknown[]) => {
      const sql = rawSqlTemplate(call)
      if (sql.includes('FROM "Plan"')) {
        return [{ plan_id: "plan_launch", is_recurring: options.recurring ?? false }]
      }
      if (sql.includes('FROM "ActionItem"')) return [action]
      return []
    }),
    planningPreference: {
      findUnique: vi.fn().mockResolvedValue(preference),
    },
    scheduleBlock: {
      findUnique: vi.fn(async (args: Record<string, unknown>) => (
        "include" in args ? refreshed : snapshot
      )),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    progressRecord: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
    actionItem: {
      update: vi.fn().mockResolvedValue({ ...action, is_completed: true }),
    },
    plan: {
      update: vi.fn().mockResolvedValue({ ...plan, progress: 0.75 }),
    },
  }
}

type MockTxDb = ReturnType<typeof makeTxDb>
type MockRootDb = MockTxDb & { $transaction: ReturnType<typeof vi.fn> }
type ServiceDb = Parameters<typeof completeScheduleBlockService>[0]

function makeDb(options: { recurring?: boolean; refreshed?: ReturnType<typeof completedBlock> } = {}): MockRootDb {
  const tx = makeTxDb(options)
  return {
    ...tx,
    $transaction: vi.fn(async (callback: (transaction: MockTxDb) => unknown) => callback(tx)),
  }
}

function completeScheduleBlock(db: MockRootDb, input: CompleteScheduleBlockInput) {
  return completeScheduleBlockService(db as unknown as ServiceDb, input)
}

const validInput: CompleteScheduleBlockInput = {
  block_id: "block_copy",
  expected_version: 1,
  outcome: "completed",
  content: "发布了首版",
  thinking: "先保护深度工作时段",
  result_note: "发布完成",
}

describe("ScheduleBlock completion service", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-23T08:30:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("completes an Action block, its ActionItem, and exactly one linked ProgressRecord", async () => {
    const db = makeDb()

    const result = await completeScheduleBlock(db, validInput)

    expect(db.$transaction).toHaveBeenCalledOnce()
    expect(db.scheduleBlock.updateMany).toHaveBeenCalledWith({
      where: {
        block_id: "block_copy",
        plan_id: "plan_launch",
        action_id: "action_copy",
        version: 1,
        status: "scheduled",
      },
      data: {
        status: "completed",
        result_note: "发布完成",
        version: { increment: 1 },
      },
    })
    expect(db.progressRecord.create).toHaveBeenCalledOnce()
    expect(db.progressRecord.create).toHaveBeenCalledWith({
      data: {
        plan_id: "plan_launch",
        schedule_block_id: "block_copy",
        content: "发布了首版",
        thinking: "先保护深度工作时段",
        outcome: "completed",
        counts_toward_recurrence: true,
      },
    })
    expect(db.actionItem.update).toHaveBeenCalledWith({
      where: { action_id: "action_copy" },
      data: {
        is_completed: true,
        completed_at: new Date("2026-08-23T08:30:00.000Z"),
      },
    })
    expect(result).toEqual(expect.objectContaining({
      block_id: "block_copy",
      status: "completed",
      result_note: "发布完成",
      version: 2,
    }))
  })

  it("records partial progress without counting recurrence or closing the ActionItem", async () => {
    const db = makeDb({
      refreshed: completedBlock({
        status: "partial",
        result_note: "完成一半",
        action,
      }),
    })

    const result = await completeScheduleBlock(db, {
      block_id: "block_copy",
      expected_version: 1,
      outcome: "partial",
      content: "写完初稿",
      result_note: "完成一半",
    })

    expect(db.progressRecord.create).toHaveBeenCalledWith({
      data: {
        plan_id: "plan_launch",
        schedule_block_id: "block_copy",
        content: "写完初稿",
        thinking: null,
        outcome: "partial",
        counts_toward_recurrence: false,
      },
    })
    expect(db.actionItem.update).not.toHaveBeenCalled()
    expect(result.status).toBe("partial")
  })

  it("skips a block with its note and creates no ProgressRecord", async () => {
    const db = makeDb({
      refreshed: completedBlock({ status: "skipped", result_note: "等待外部反馈", action }),
    })

    const result = await completeScheduleBlock(db, {
      block_id: "block_copy",
      expected_version: 1,
      outcome: "skipped",
      result_note: "等待外部反馈",
    })

    expect(db.scheduleBlock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        status: "skipped",
        result_note: "等待外部反馈",
        version: { increment: 1 },
      },
    }))
    expect(db.progressRecord.create).not.toHaveBeenCalled()
    expect(db.actionItem.update).not.toHaveBeenCalled()
    expect(result.status).toBe("skipped")
  })

  it("creates a counting record for a completed recurring Plan block", async () => {
    const recurringSnapshot = { ...snapshot, action_id: null }
    const db = makeDb({
      recurring: true,
      refreshed: completedBlock({ action_id: null, action: null }),
    })
    db.scheduleBlock.findUnique.mockImplementation(async (args: Record<string, unknown>) => (
      "include" in args ? completedBlock({ action_id: null, action: null }) : recurringSnapshot
    ))

    await completeScheduleBlock(db, {
      block_id: "block_copy",
      expected_version: 1,
      outcome: "completed",
    })

    expect(db.progressRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        plan_id: "plan_launch",
        schedule_block_id: "block_copy",
        outcome: "completed",
        counts_toward_recurrence: true,
      }),
    })
    expect(db.plan.update).not.toHaveBeenCalled()
    expect(db.actionItem.update).not.toHaveBeenCalled()
  })

  it("applies explicit progress to an ordinary Plan in the same transaction", async () => {
    const db = makeDb()

    await completeScheduleBlock(db, { ...validInput, plan_progress: 0.75 })

    expect(db.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_launch" },
      data: { progress: 0.75 },
    })
    const transactionCallback = db.$transaction.mock.calls[0]?.[0]
    expect(transactionCallback).toEqual(expect.any(Function))
  })

  it.each([
    ["null input", null],
    ["array input", []],
    ["unexpected field", { ...validInput, operation: "complete" }],
    ["blank id", { ...validInput, block_id: "  " }],
    ["zero version", { ...validInput, expected_version: 0 }],
    ["fractional version", { ...validInput, expected_version: 1.5 }],
    ["terminal overflow version", { ...validInput, expected_version: 2_147_483_647 }],
    ["PostgreSQL integer overflow version", { ...validInput, expected_version: 2_147_483_648 }],
    ["unsafe version", { ...validInput, expected_version: Number.MAX_SAFE_INTEGER + 1 }],
    ["infinite version", { ...validInput, expected_version: Number.POSITIVE_INFINITY }],
    ["unknown outcome", { ...validInput, outcome: "cancelled" }],
    ["nullable text", { ...validInput, content: null }],
    ["NaN progress", { ...validInput, plan_progress: Number.NaN }],
    ["negative progress", { ...validInput, plan_progress: -0.01 }],
    ["overflow progress", { ...validInput, plan_progress: 1.01 }],
  ])("rejects strict invalid input: %s", async (_label, input) => {
    const db = makeDb()

    await expect(completeScheduleBlock(
      db,
      input as unknown as CompleteScheduleBlockInput,
    )).rejects.toMatchObject({ code: "VALIDATION" })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.scheduleBlock.updateMany).not.toHaveBeenCalled()
    expect(db.progressRecord.create).not.toHaveBeenCalled()
  })

  it("completes at max-1 and writes a terminal max version", async () => {
    const db = makeDb({ refreshed: completedBlock({ version: 2_147_483_647 }) })

    const result = await completeScheduleBlock(db, {
      ...validInput,
      expected_version: 2_147_483_646,
    })

    expect(db.scheduleBlock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ version: 2_147_483_646, status: "scheduled" }),
      data: expect.objectContaining({ version: { increment: 1 } }),
    }))
    expect(db.progressRecord.create).toHaveBeenCalledOnce()
    expect(result.version).toBe(2_147_483_647)
  })

  it("rejects plan_progress for recurring Plans before any mutation", async () => {
    const db = makeDb({ recurring: true })

    await expect(completeScheduleBlock(db, {
      ...validInput,
      plan_progress: 0.5,
    })).rejects.toMatchObject({ code: "VALIDATION" })

    expect(db.scheduleBlock.updateMany).not.toHaveBeenCalled()
    expect(db.progressRecord.create).not.toHaveBeenCalled()
    expect(db.actionItem.update).not.toHaveBeenCalled()
    expect(db.plan.update).not.toHaveBeenCalled()
  })

  it.each([
    ["stale version", { count: 0 }],
    ["non-scheduled status", { count: 0 }],
  ])("returns a conflict for %s and performs no later writes", async (_label, casResult) => {
    const db = makeDb()
    db.scheduleBlock.updateMany.mockResolvedValue(casResult)

    await expect(completeScheduleBlock(db, validInput)).rejects.toMatchObject({
      code: "STALE_VERSION",
    })

    expect(db.progressRecord.create).not.toHaveBeenCalled()
    expect(db.actionItem.update).not.toHaveBeenCalled()
    expect(db.plan.update).not.toHaveBeenCalled()
    expect(db.scheduleBlock.findUnique).toHaveBeenCalledOnce()
  })

  it("does not create a second ProgressRecord when a completion is retried", async () => {
    const db = makeDb()
    db.scheduleBlock.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    await completeScheduleBlock(db, validInput)
    await expect(completeScheduleBlock(db, validInput)).rejects.toMatchObject({
      code: "STALE_VERSION",
    })

    expect(db.progressRecord.create).toHaveBeenCalledOnce()
  })

  it("waits for the local-date and Plan locks before CAS, then locks the ActionItem", async () => {
    const db = makeDb()
    const planLock = deferred<Array<{ plan_id: string; is_recurring: boolean }>>()
    db.$queryRaw.mockImplementation((...call: unknown[]) => (
      rawSqlTemplate(call).includes('FROM "Plan"')
        ? planLock.promise
        : Promise.resolve([action])
    ))

    const pending = completeScheduleBlock(db, validInput)
    await vi.waitFor(() => {
      expect(db.$queryRaw.mock.calls.some(call => rawSqlTemplate(call).includes('FROM "Plan"'))).toBe(true)
    })

    expect(db.$executeRaw).toHaveBeenCalledOnce()
    expect(db.scheduleBlock.updateMany).not.toHaveBeenCalled()
    expect(db.$queryRaw.mock.calls.some(call => rawSqlTemplate(call).includes('FROM "ActionItem"'))).toBe(false)

    planLock.resolve([{ plan_id: "plan_launch", is_recurring: false }])
    await pending

    const planCall = db.$queryRaw.mock.calls.find(call => rawSqlTemplate(call).includes('FROM "Plan"'))
    const actionCall = db.$queryRaw.mock.calls.find(call => rawSqlTemplate(call).includes('FROM "ActionItem"'))
    expect(rawSqlTemplate(planCall ?? [])).toBe(
      'SELECT "plan_id", "is_recurring" FROM "Plan" WHERE "plan_id" = ? FOR UPDATE',
    )
    expect(rawSqlTemplate(actionCall ?? [])).toBe(
      'SELECT "action_id", "plan_id", "is_completed" FROM "ActionItem" WHERE "action_id" = ? FOR UPDATE',
    )
    expect(db.scheduleBlock.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.$queryRaw.mock.invocationCallOrder.at(-1) ?? 0,
    )
  })

  it("rejects an ownership change through the guarded CAS", async () => {
    const db = makeDb()
    db.scheduleBlock.updateMany.mockResolvedValue({ count: 0 })

    await expect(completeScheduleBlock(db, validInput)).rejects.toMatchObject({ code: "STALE_VERSION" })

    expect(db.scheduleBlock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plan_id: snapshot.plan_id,
        action_id: snapshot.action_id,
      }),
    }))
  })

  it("does not perform Action or Plan writes when ProgressRecord creation fails", async () => {
    const db = makeDb()
    const failure = new Error("progress unavailable")
    db.progressRecord.create.mockRejectedValue(failure)

    await expect(completeScheduleBlock(db, { ...validInput, plan_progress: 0.8 })).rejects.toBe(failure)

    expect(db.actionItem.update).not.toHaveBeenCalled()
    expect(db.plan.update).not.toHaveBeenCalled()
  })

  it.each([
    ["P2034", prismaError("P2034"), "SCHEDULE_CONFLICT"],
    ["progress uniqueness P2002", prismaError("P2002", ["schedule_block_id"]), "STALE_VERSION"],
    ["progress constraint P2002", prismaError("P2002", "ProgressRecord_schedule_block_id_key"), "STALE_VERSION"],
    ["missing relation P2003", prismaError("P2003"), "NOT_FOUND"],
  ])("maps %s transaction failures", async (_label, failure, code) => {
    const db = makeDb()
    db.progressRecord.create.mockRejectedValue(failure)

    await expect(completeScheduleBlock(db, validInput)).rejects.toMatchObject({ code })
  })

  it.each([
    ["ProgressRecord id", prismaError("P2002", ["id"])],
    ["unknown target", prismaError("P2002")],
  ])("does not hide unrelated P2002 failures for %s", async (_label, failure) => {
    const db = makeDb()
    db.progressRecord.create.mockRejectedValue(failure)

    await expect(completeScheduleBlock(db, validInput)).rejects.toBe(failure)
  })

  it("rethrows unknown transaction failures", async () => {
    const db = makeDb()
    const failure = new Error("database unavailable")
    db.scheduleBlock.updateMany.mockRejectedValue(failure)

    await expect(completeScheduleBlock(db, validInput)).rejects.toBe(failure)
  })
})
