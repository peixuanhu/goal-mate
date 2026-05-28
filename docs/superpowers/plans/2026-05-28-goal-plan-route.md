# Goal Plan Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class one-to-many Goal-to-Plan execution route so each goal can expand inline to show and drag-sort its ordered plan steps.

**Architecture:** Add `Plan.goal_id` and `Plan.goal_position` as the durable route fields, while keeping tags as cross-cutting labels. Update plan APIs to use strict goal ownership, add a dedicated order endpoint for drag sorting, and add a focused goal-page component that loads and sorts plans for one expanded goal. Keep the first version scoped to same-goal sorting and manual attachment of unassigned plans.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma/PostgreSQL, Vitest, `@dnd-kit/core`, `@dnd-kit/sortable`, Tailwind CSS, shadcn-style local UI components.

---

## File Structure

- Modify `prisma/schema.prisma`: add Goal/Plan relation fields and index.
- Create `src/lib/plan-goal-utils.ts`: shared route-position and order-validation helpers.
- Create `src/lib/plan-goal-utils.test.ts`: fast unit tests for route-position helpers.
- Modify `src/app/api/plan/route.ts`: strict `goal_id` filtering, goal relation in responses, create/update binding behavior, unassigned filter.
- Create `src/app/api/plan/route.test.ts`: API tests for strict ownership and binding behavior.
- Create `src/app/api/plan/order/route.ts`: reorder all plans under one goal.
- Create `src/app/api/plan/order/route.test.ts`: API tests for successful and invalid reorders.
- Create `src/components/goals/goal-plan-list.tsx`: expanded goal row plan list with same-goal drag sorting and attach/new-plan controls.
- Modify `src/app/goals/page.tsx`: add expand/collapse state and render `GoalPlanList` under expanded goals.
- Modify `src/app/plans/page.tsx`: add goal selection in form/filter/table and honor `?goal_id=...`.
- Modify `src/app/api/copilotkit/route.ts`: let `createPlan` accept and validate optional `goal_id`.

Existing Vitest config is Node-only. Do not introduce React Testing Library or jsdom for this feature. Cover API and pure ordering behavior with automated tests, then manually verify the drag UI in-browser.

---

### Task 1: Schema And Ordering Helpers

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/plan-goal-utils.ts`
- Create: `src/lib/plan-goal-utils.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/lib/plan-goal-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  GOAL_POSITION_STEP,
  buildGoalPositionUpdates,
  getNextGoalPosition,
  validateGoalPlanOrder,
} from "./plan-goal-utils"

describe("plan-goal-utils", () => {
  it("calculates the first and next sparse positions", () => {
    expect(GOAL_POSITION_STEP).toBe(1000)
    expect(getNextGoalPosition(null)).toBe(1000)
    expect(getNextGoalPosition(undefined)).toBe(1000)
    expect(getNextGoalPosition(3000)).toBe(4000)
  })

  it("builds stable sparse position updates from ordered plan ids", () => {
    expect(buildGoalPositionUpdates(["plan_a", "plan_b", "plan_c"])).toEqual([
      { plan_id: "plan_a", goal_position: 1000 },
      { plan_id: "plan_b", goal_position: 2000 },
      { plan_id: "plan_c", goal_position: 3000 },
    ])
  })

  it("accepts a complete same-goal ordering", () => {
    const result = validateGoalPlanOrder({
      goal_id: "goal_music",
      ordered_plan_ids: ["plan_a", "plan_b"],
      currentPlans: [
        { plan_id: "plan_a", goal_id: "goal_music" },
        { plan_id: "plan_b", goal_id: "goal_music" },
      ],
    })

    expect(result).toEqual({ ok: true })
  })

  it("rejects duplicate plan ids", () => {
    const result = validateGoalPlanOrder({
      goal_id: "goal_music",
      ordered_plan_ids: ["plan_a", "plan_a"],
      currentPlans: [{ plan_id: "plan_a", goal_id: "goal_music" }],
    })

    expect(result).toEqual({ ok: false, error: "ordered_plan_ids must not contain duplicates" })
  })

  it("rejects incomplete ordering lists", () => {
    const result = validateGoalPlanOrder({
      goal_id: "goal_music",
      ordered_plan_ids: ["plan_a"],
      currentPlans: [
        { plan_id: "plan_a", goal_id: "goal_music" },
        { plan_id: "plan_b", goal_id: "goal_music" },
      ],
    })

    expect(result).toEqual({ ok: false, error: "ordered_plan_ids must include every plan for this goal" })
  })

  it("rejects plan ids that do not belong to the goal", () => {
    const result = validateGoalPlanOrder({
      goal_id: "goal_music",
      ordered_plan_ids: ["plan_a", "plan_other"],
      currentPlans: [{ plan_id: "plan_a", goal_id: "goal_music" }],
    })

    expect(result).toEqual({ ok: false, error: "ordered_plan_ids contains a plan outside this goal" })
  })
})
```

- [ ] **Step 2: Run helper tests to verify they fail**

Run:

```bash
npm test -- src/lib/plan-goal-utils.test.ts
```

Expected: FAIL because `src/lib/plan-goal-utils.ts` does not exist.

- [ ] **Step 3: Add schema relation fields**

Modify `prisma/schema.prisma`.

Change `Goal` to include `plans`:

```prisma
model Goal {
  id           Int      @id @default(autoincrement())
  gmt_create   DateTime @default(now())
  gmt_modified DateTime @updatedAt
  goal_id      String   @unique
  tag          String
  name         String
  description  String?
  plans        Plan[]
}
```

Change `Plan` to include `goal_id`, `goal_position`, relation, and index:

```prisma
model Plan {
  id                Int                  @id @default(autoincrement())
  gmt_create        DateTime             @default(now())
  gmt_modified      DateTime             @updatedAt
  plan_id           String               @unique
  name              String
  description       String?
  difficulty        String?
  progress          Float                @default(0)
  is_recurring      Boolean              @default(false)
  recurrence_type   String?
  recurrence_value  String?
  goal_id           String?
  goal_position     Int?
  priority_quadrant String? // "q1"=重要紧急, "q2"=重要不紧急, "q3"=不重要紧急, "q4"=不重要不紧急, null=未安排
  is_scheduled      Boolean              @default(false) // 是否被安排到四象限中显示
  goal              Goal?                @relation(fields: [goal_id], references: [goal_id], onDelete: SetNull)
  tags              PlanTagAssociation[]
  progressRecords   ProgressRecord[]

  @@index([goal_id, goal_position])
}
```

- [ ] **Step 4: Add ordering helper implementation**

Create `src/lib/plan-goal-utils.ts`:

```ts
export const GOAL_POSITION_STEP = 1000

export type GoalPlanOrderCandidate = {
  plan_id: string
  goal_id: string | null
}

export type GoalPlanOrderValidationInput = {
  goal_id: string
  ordered_plan_ids: string[]
  currentPlans: GoalPlanOrderCandidate[]
}

export type GoalPlanOrderValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export function getNextGoalPosition(maxGoalPosition: number | null | undefined): number {
  return typeof maxGoalPosition === "number" ? maxGoalPosition + GOAL_POSITION_STEP : GOAL_POSITION_STEP
}

export function buildGoalPositionUpdates(orderedPlanIds: string[]): Array<{ plan_id: string; goal_position: number }> {
  return orderedPlanIds.map((plan_id, index) => ({
    plan_id,
    goal_position: (index + 1) * GOAL_POSITION_STEP,
  }))
}

export function validateGoalPlanOrder({
  goal_id,
  ordered_plan_ids,
  currentPlans,
}: GoalPlanOrderValidationInput): GoalPlanOrderValidationResult {
  if (!Array.isArray(ordered_plan_ids) || ordered_plan_ids.length === 0) {
    return { ok: false, error: "ordered_plan_ids must be a non-empty array" }
  }

  const uniquePlanIds = new Set(ordered_plan_ids)
  if (uniquePlanIds.size !== ordered_plan_ids.length) {
    return { ok: false, error: "ordered_plan_ids must not contain duplicates" }
  }

  const currentPlanIds = new Set(currentPlans.map(plan => plan.plan_id))
  if (currentPlanIds.size !== ordered_plan_ids.length) {
    return { ok: false, error: "ordered_plan_ids must include every plan for this goal" }
  }

  for (const plan of currentPlans) {
    if (plan.goal_id !== goal_id) {
      return { ok: false, error: "currentPlans contains a plan outside this goal" }
    }
  }

  for (const planId of ordered_plan_ids) {
    if (!currentPlanIds.has(planId)) {
      return { ok: false, error: "ordered_plan_ids contains a plan outside this goal" }
    }
  }

  return { ok: true }
}
```

- [ ] **Step 5: Run helper tests to verify they pass**

Run:

```bash
npm test -- src/lib/plan-goal-utils.test.ts
```

Expected: PASS.

- [ ] **Step 6: Generate Prisma client**

Run:

```bash
npm run db:generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 7: Commit schema and helpers**

Run:

```bash
git add prisma/schema.prisma src/lib/plan-goal-utils.ts src/lib/plan-goal-utils.test.ts
git commit -m "feat: add goal plan route schema"
```

---

### Task 2: Plan API Strict Goal Ownership

**Files:**
- Modify: `src/app/api/plan/route.ts`
- Create: `src/app/api/plan/route.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `src/app/api/plan/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const prismaMock = vi.hoisted(() => ({
  plan: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    aggregate: vi.fn(),
    delete: vi.fn(),
  },
  goal: {
    findUnique: vi.fn(),
  },
  planTagAssociation: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

import { GET, POST, PUT } from "./route"

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(url, init)
}

async function json(response: Response) {
  return response.json()
}

const basePlan = {
  id: 1,
  gmt_create: new Date("2026-05-01T00:00:00.000Z"),
  gmt_modified: new Date("2026-05-01T00:00:00.000Z"),
  plan_id: "plan_ddia",
  name: "读完 DDIA",
  description: "",
  difficulty: "hard",
  progress: 0,
  is_recurring: false,
  recurrence_type: null,
  recurrence_value: null,
  goal_id: "goal_arch",
  goal_position: 1000,
  priority_quadrant: null,
  is_scheduled: false,
  tags: [{ tag: "reading" }],
  goal: { goal_id: "goal_arch", name: "提升系统设计能力", tag: "study" },
  progressRecords: [],
}

describe("/api/plan", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("GET filters strictly by Plan.goal_id", async () => {
    prismaMock.plan.findMany.mockResolvedValue([basePlan])
    prismaMock.plan.count.mockResolvedValue(1)

    const response = await GET(request("http://localhost/api/plan?goal_id=goal_arch&pageSize=1000"))

    expect(response.status).toBe(200)
    expect(prismaMock.goal.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.plan.findMany).toHaveBeenCalledWith({
      where: { goal_id: "goal_arch" },
      skip: 0,
      take: 1000,
      orderBy: [{ goal_position: "asc" }, { gmt_create: "asc" }],
      include: {
        tags: true,
        goal: { select: { goal_id: true, name: true, tag: true } },
        progressRecords: {
          select: { gmt_create: true },
          orderBy: { gmt_create: "desc" },
        },
      },
    })
    expect(await json(response)).toEqual({
      list: [
        {
          ...basePlan,
          gmt_create: "2026-05-01T00:00:00.000Z",
          gmt_modified: "2026-05-01T00:00:00.000Z",
          tags: ["reading"],
        },
      ],
      total: 1,
    })
  })

  it("GET supports unassigned plans", async () => {
    prismaMock.plan.findMany.mockResolvedValue([])
    prismaMock.plan.count.mockResolvedValue(0)

    const response = await GET(request("http://localhost/api/plan?unassigned=true&pageSize=1000"))

    expect(response.status).toBe(200)
    expect(prismaMock.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { goal_id: null },
    }))
  })

  it("POST rejects missing goals", async () => {
    prismaMock.goal.findUnique.mockResolvedValue(null)

    const response = await POST(
      request("http://localhost/api/plan", {
        method: "POST",
        body: JSON.stringify({
          name: "读完 DDIA",
          difficulty: "hard",
          tags: ["reading"],
          goal_id: "goal_missing",
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "目标不存在" })
    expect(prismaMock.plan.create).not.toHaveBeenCalled()
  })

  it("POST creates a goal-bound plan at the end of the route", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({ goal_id: "goal_arch" })
    prismaMock.plan.aggregate.mockResolvedValue({ _max: { goal_position: 2000 } })
    prismaMock.plan.create.mockResolvedValue({ ...basePlan, goal_position: 3000 })
    prismaMock.planTagAssociation.create.mockResolvedValue({})

    const response = await POST(
      request("http://localhost/api/plan", {
        method: "POST",
        body: JSON.stringify({
          name: "读完 DDIA",
          difficulty: "hard",
          tags: ["reading"],
          goal_id: "goal_arch",
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.plan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "读完 DDIA",
        difficulty: "hard",
        goal_id: "goal_arch",
        goal_position: 3000,
        plan_id: expect.stringMatching(/^plan_[a-f0-9]{10}$/),
      }),
    })
  })

  it("PUT moves a plan to a new goal and assigns the next position", async () => {
    prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_ddia", goal_id: null })
    prismaMock.goal.findUnique.mockResolvedValue({ goal_id: "goal_arch" })
    prismaMock.plan.aggregate.mockResolvedValue({ _max: { goal_position: null } })
    prismaMock.plan.update.mockResolvedValue({ ...basePlan, goal_position: 1000 })

    const response = await PUT(
      request("http://localhost/api/plan", {
        method: "PUT",
        body: JSON.stringify({
          plan_id: "plan_ddia",
          goal_id: "goal_arch",
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_ddia" },
      data: { goal_id: "goal_arch", goal_position: 1000 },
    })
  })

  it("PUT clears goal ownership and position", async () => {
    prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_ddia", goal_id: "goal_arch" })
    prismaMock.plan.update.mockResolvedValue({ ...basePlan, goal_id: null, goal_position: null })

    const response = await PUT(
      request("http://localhost/api/plan", {
        method: "PUT",
        body: JSON.stringify({
          plan_id: "plan_ddia",
          goal_id: null,
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_ddia" },
      data: { goal_id: null, goal_position: null },
    })
  })
})
```

- [ ] **Step 2: Run API tests to verify they fail**

Run:

```bash
npm test -- src/app/api/plan/route.test.ts
```

Expected: FAIL because current route still resolves `goal_id` through `Goal.tag` and does not support `goal_position`.

- [ ] **Step 3: Update plan route imports and helper functions**

At the top of `src/app/api/plan/route.ts`, add:

```ts
import { getNextGoalPosition } from '@/lib/plan-goal-utils'
```

Under the Prisma client, add:

```ts
function normalizeGoalId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return String(value)
}

async function getNextPositionForGoal(goal_id: string): Promise<number> {
  const result = await prisma.plan.aggregate({
    where: { goal_id },
    _max: { goal_position: true },
  })

  return getNextGoalPosition(result._max.goal_position)
}
```

- [ ] **Step 4: Replace the GET handler**

Replace the current `GET` function in `src/app/api/plan/route.ts` with:

```ts
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tag = searchParams.get('tag')
  const difficulty = searchParams.get('difficulty')
  const goal_id = searchParams.get('goal_id')
  const is_scheduled = searchParams.get('is_scheduled')
  const priority_quadrant = searchParams.get('priority_quadrant')
  const unscheduled = searchParams.get('unscheduled')
  const unassigned = searchParams.get('unassigned')
  const pageNum = parseInt(searchParams.get('pageNum') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '10')

  const where: Record<string, unknown> = {}
  if (difficulty) where.difficulty = difficulty
  if (is_scheduled !== null && is_scheduled !== undefined) {
    where.is_scheduled = is_scheduled === 'true'
  }
  if (priority_quadrant) where.priority_quadrant = priority_quadrant
  if (unscheduled === 'true') {
    where.is_scheduled = false
  }
  if (unassigned === 'true') {
    where.goal_id = null
  } else if (goal_id) {
    where.goal_id = goal_id
  }
  if (!goal_id && unassigned !== 'true' && tag) {
    where.tags = { some: { tag } }
  }

  const orderBy = goal_id
    ? [{ goal_position: 'asc' as const }, { gmt_create: 'asc' as const }]
    : { gmt_create: 'desc' as const }

  const [plans, total] = await Promise.all([
    prisma.plan.findMany({
      where,
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
      orderBy,
      include: {
        tags: true,
        goal: { select: { goal_id: true, name: true, tag: true } },
        progressRecords: {
          select: {
            gmt_create: true
          },
          orderBy: { gmt_create: 'desc' }
        }
      }
    }),
    prisma.plan.count({ where })
  ])

  const result = plans.map(plan => ({
    ...plan,
    tags: plan.tags.map(t => t.tag)
  }))

  return NextResponse.json({ list: result, total })
}
```

- [ ] **Step 5: Replace the POST handler**

Replace the current `POST` function with:

```ts
export async function POST(req: NextRequest) {
  const data = await req.json()
  const { tags, goal_id: rawGoalId, goal_position, goal, ...planData } = data
  const goal_id = normalizeGoalId(rawGoalId)

  const createData: Record<string, unknown> = {
    ...planData,
    plan_id: `plan_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
  }

  if (goal_id) {
    const existingGoal = await prisma.goal.findUnique({ where: { goal_id } })
    if (!existingGoal) {
      return NextResponse.json({ error: '目标不存在' }, { status: 400 })
    }
    createData.goal_id = goal_id
    createData.goal_position = await getNextPositionForGoal(goal_id)
  }

  const plan = await prisma.plan.create({ data: createData })

  if (tags && Array.isArray(tags)) {
    await Promise.all(tags.map((tag: string) =>
      prisma.planTagAssociation.create({ data: { plan_id: plan.plan_id, tag } })
    ))
  }
  return NextResponse.json(plan)
}
```

- [ ] **Step 6: Replace the PUT handler**

Replace the current `PUT` function with:

```ts
export async function PUT(req: NextRequest) {
  const data = await req.json()
  const { plan_id, tags, progressRecords, id, gmt_create, gmt_modified, goal, goal_position, ...rest } = data

  const updateData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rest)) {
    if (key !== 'goal_id' && value !== undefined) {
      updateData[key] = value
    }
  }

  if (Object.prototype.hasOwnProperty.call(rest, 'goal_id')) {
    const nextGoalId = normalizeGoalId(rest.goal_id)
    const existingPlan = await prisma.plan.findUnique({
      where: { plan_id },
      select: { goal_id: true },
    })
    if (!existingPlan) {
      return NextResponse.json({ error: '计划不存在' }, { status: 404 })
    }

    if (nextGoalId === null) {
      updateData.goal_id = null
      updateData.goal_position = null
    } else if (nextGoalId && nextGoalId !== existingPlan.goal_id) {
      const existingGoal = await prisma.goal.findUnique({ where: { goal_id: nextGoalId } })
      if (!existingGoal) {
        return NextResponse.json({ error: '目标不存在' }, { status: 400 })
      }
      updateData.goal_id = nextGoalId
      updateData.goal_position = await getNextPositionForGoal(nextGoalId)
    }
  }

  const plan = await prisma.plan.update({
    where: { plan_id },
    data: updateData
  })

  if (tags && Array.isArray(tags)) {
    await prisma.planTagAssociation.deleteMany({ where: { plan_id } })
    await Promise.all(tags.map((tag: string) =>
      prisma.planTagAssociation.create({ data: { plan_id, tag } })
    ))
  }
  return NextResponse.json(plan)
}
```

- [ ] **Step 7: Run plan API tests**

Run:

```bash
npm test -- src/app/api/plan/route.test.ts src/lib/plan-goal-utils.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit plan API changes**

Run:

```bash
git add src/app/api/plan/route.ts src/app/api/plan/route.test.ts src/lib/plan-goal-utils.ts src/lib/plan-goal-utils.test.ts
git commit -m "feat: bind plans to goals"
```

---

### Task 3: Plan Order API

**Files:**
- Create: `src/app/api/plan/order/route.ts`
- Create: `src/app/api/plan/order/route.test.ts`

- [ ] **Step 1: Write failing order API tests**

Create `src/app/api/plan/order/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  goal: {
    findUnique: vi.fn(),
  },
  plan: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

import { PUT } from "./route"

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(url, init)
}

async function json(response: Response) {
  return response.json()
}

describe("/api/plan/order", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    prismaMock.$transaction.mockImplementation(async (operations: unknown[]) => operations)
  })

  it("reorders every plan under a goal", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({ goal_id: "goal_arch" })
    prismaMock.plan.findMany
      .mockResolvedValueOnce([
        { plan_id: "plan_a", goal_id: "goal_arch" },
        { plan_id: "plan_b", goal_id: "goal_arch" },
      ])
      .mockResolvedValueOnce([
        {
          plan_id: "plan_b",
          name: "第二步",
          goal_id: "goal_arch",
          goal_position: 1000,
          tags: [{ tag: "study" }],
          goal: { goal_id: "goal_arch", name: "系统设计", tag: "study" },
          progressRecords: [],
        },
        {
          plan_id: "plan_a",
          name: "第一步",
          goal_id: "goal_arch",
          goal_position: 2000,
          tags: [{ tag: "study" }],
          goal: { goal_id: "goal_arch", name: "系统设计", tag: "study" },
          progressRecords: [],
        },
      ])
    prismaMock.plan.update.mockResolvedValue({})

    const response = await PUT(
      request("http://localhost/api/plan/order", {
        method: "PUT",
        body: JSON.stringify({
          goal_id: "goal_arch",
          ordered_plan_ids: ["plan_b", "plan_a"],
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_b" },
      data: { goal_position: 1000 },
    })
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_a" },
      data: { goal_position: 2000 },
    })
    expect(await json(response)).toEqual({
      list: [
        expect.objectContaining({ plan_id: "plan_b", tags: ["study"] }),
        expect.objectContaining({ plan_id: "plan_a", tags: ["study"] }),
      ],
      total: 2,
    })
  })

  it("rejects missing goals", async () => {
    prismaMock.goal.findUnique.mockResolvedValue(null)

    const response = await PUT(
      request("http://localhost/api/plan/order", {
        method: "PUT",
        body: JSON.stringify({
          goal_id: "goal_missing",
          ordered_plan_ids: ["plan_a"],
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "目标不存在" })
    expect(prismaMock.plan.update).not.toHaveBeenCalled()
  })

  it("rejects incomplete ordering", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({ goal_id: "goal_arch" })
    prismaMock.plan.findMany.mockResolvedValue([
      { plan_id: "plan_a", goal_id: "goal_arch" },
      { plan_id: "plan_b", goal_id: "goal_arch" },
    ])

    const response = await PUT(
      request("http://localhost/api/plan/order", {
        method: "PUT",
        body: JSON.stringify({
          goal_id: "goal_arch",
          ordered_plan_ids: ["plan_a"],
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "ordered_plan_ids must include every plan for this goal" })
    expect(prismaMock.plan.update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run order API tests to verify they fail**

Run:

```bash
npm test -- src/app/api/plan/order/route.test.ts
```

Expected: FAIL because `src/app/api/plan/order/route.ts` does not exist.

- [ ] **Step 3: Implement order route**

Create `src/app/api/plan/order/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

import { buildGoalPositionUpdates, validateGoalPlanOrder } from '@/lib/plan-goal-utils'

const prisma = new PrismaClient()

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0)
}

export async function PUT(req: NextRequest) {
  let data: unknown
  try {
    data = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体必须是有效 JSON 对象' }, { status: 400 })
  }

  if (!data || typeof data !== 'object') {
    return NextResponse.json({ error: '请求体必须是有效 JSON 对象' }, { status: 400 })
  }

  const body = data as { goal_id?: unknown; ordered_plan_ids?: unknown }
  if (typeof body.goal_id !== 'string' || body.goal_id.length === 0) {
    return NextResponse.json({ error: 'goal_id required' }, { status: 400 })
  }
  if (!isStringArray(body.ordered_plan_ids)) {
    return NextResponse.json({ error: 'ordered_plan_ids must be a non-empty string array' }, { status: 400 })
  }

  const goal = await prisma.goal.findUnique({
    where: { goal_id: body.goal_id },
    select: { goal_id: true },
  })
  if (!goal) {
    return NextResponse.json({ error: '目标不存在' }, { status: 400 })
  }

  const currentPlans = await prisma.plan.findMany({
    where: { goal_id: body.goal_id },
    select: { plan_id: true, goal_id: true },
  })

  const validation = validateGoalPlanOrder({
    goal_id: body.goal_id,
    ordered_plan_ids: body.ordered_plan_ids,
    currentPlans,
  })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const updates = buildGoalPositionUpdates(body.ordered_plan_ids)
  await prisma.$transaction(
    updates.map(update =>
      prisma.plan.update({
        where: { plan_id: update.plan_id },
        data: { goal_position: update.goal_position },
      }),
    ),
  )

  const plans = await prisma.plan.findMany({
    where: { goal_id: body.goal_id },
    orderBy: [{ goal_position: 'asc' }, { gmt_create: 'asc' }],
    include: {
      tags: true,
      goal: { select: { goal_id: true, name: true, tag: true } },
      progressRecords: {
        select: { gmt_create: true },
        orderBy: { gmt_create: 'desc' },
      },
    },
  })

  return NextResponse.json({
    list: plans.map(plan => ({
      ...plan,
      tags: plan.tags.map(tag => tag.tag),
    })),
    total: plans.length,
  })
}
```

- [ ] **Step 4: Run order API tests**

Run:

```bash
npm test -- src/app/api/plan/order/route.test.ts src/lib/plan-goal-utils.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit order API**

Run:

```bash
git add src/app/api/plan/order/route.ts src/app/api/plan/order/route.test.ts
git commit -m "feat: add goal plan ordering api"
```

---

### Task 4: Goal Page Expanded Plan List

**Files:**
- Create: `src/components/goals/goal-plan-list.tsx`
- Modify: `src/app/goals/page.tsx`

- [ ] **Step 1: Create goal plan list component**

Create `src/components/goals/goal-plan-list.tsx`:

```tsx
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getRecurringTaskDetails, getRecurrenceTypeDisplay } from "@/lib/recurring-utils"

type GoalPlan = {
  plan_id: string
  name: string
  difficulty?: string | null
  progress: number
  is_recurring: boolean
  recurrence_type?: string | null
  recurrence_value?: string | null
  tags: string[]
  progressRecords?: Array<{ gmt_create: string | Date }>
}

type GoalPlanListProps = {
  goalId: string
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { error?: string; message?: string }
    return data.error ?? data.message ?? fallback
  } catch {
    return fallback
  }
}

function formatProgress(plan: GoalPlan): string {
  if (plan.is_recurring) {
    const details = getRecurringTaskDetails({
      ...plan,
      progressRecords: (plan.progressRecords ?? []).map(record => ({ gmt_create: new Date(record.gmt_create) })),
    })
    return details ? `${details.progressText} ${details.statusText}` : getRecurrenceTypeDisplay(plan.recurrence_type || "")
  }

  return `${Math.round((plan.progress || 0) * 100)}%`
}

function formatRecentProgress(plan: GoalPlan): string {
  const firstRecord = plan.progressRecords?.[0]
  if (!firstRecord) return "暂无进展"

  return new Date(firstRecord.gmt_create).toLocaleDateString("zh-CN")
}

function SortablePlanRow({ plan, index }: { plan: GoalPlan; index: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.plan_id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`grid grid-cols-[32px_72px_minmax(180px,1fr)_96px_110px_160px] items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 ${
        isDragging ? "bg-blue-50 opacity-80" : "bg-white dark:bg-gray-950"
      }`}
    >
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded border text-gray-500 hover:bg-gray-50"
        aria-label={`拖拽排序 ${plan.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="font-medium text-gray-700 dark:text-gray-200">第 {index + 1} 步</span>
      <div className="min-w-0">
        <div className="truncate font-medium">{plan.name}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {plan.tags.slice(0, 3).map(tag => (
            <span key={tag} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
              {tag}
            </span>
          ))}
        </div>
      </div>
      <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">{plan.difficulty || "未设置"}</span>
      <span className="text-gray-700 dark:text-gray-200">{formatProgress(plan)}</span>
      <span className="text-gray-500">{formatRecentProgress(plan)}</span>
    </div>
  )
}

export function GoalPlanList({ goalId }: GoalPlanListProps) {
  const router = useRouter()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [plans, setPlans] = React.useState<GoalPlan[]>([])
  const [unassignedPlans, setUnassignedPlans] = React.useState<GoalPlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadPlans = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [goalPlansResponse, unassignedResponse] = await Promise.all([
        fetch(`/api/plan?goal_id=${encodeURIComponent(goalId)}&pageSize=1000`),
        fetch("/api/plan?unassigned=true&pageSize=1000"),
      ])
      if (!goalPlansResponse.ok) {
        throw new Error(await readApiError(goalPlansResponse, "关联计划加载失败"))
      }
      if (!unassignedResponse.ok) {
        throw new Error(await readApiError(unassignedResponse, "未归属计划加载失败"))
      }
      const goalPlansData = await goalPlansResponse.json() as { list?: GoalPlan[] }
      const unassignedData = await unassignedResponse.json() as { list?: GoalPlan[] }
      setPlans(goalPlansData.list ?? [])
      setUnassignedPlans(unassignedData.list ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "计划加载失败")
    } finally {
      setLoading(false)
    }
  }, [goalId])

  React.useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  async function saveOrder(nextPlans: GoalPlan[], previousPlans: GoalPlan[]) {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/plan/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_id: goalId,
          ordered_plan_ids: nextPlans.map(plan => plan.plan_id),
        }),
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, "排序保存失败"))
      }
      const data = await response.json() as { list?: GoalPlan[] }
      setPlans(data.list ?? nextPlans)
    } catch (saveError) {
      setPlans(previousPlans)
      setError(saveError instanceof Error ? saveError.message : "排序保存失败")
    } finally {
      setSaving(false)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = plans.findIndex(plan => plan.plan_id === active.id)
    const newIndex = plans.findIndex(plan => plan.plan_id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const previousPlans = plans
    const nextPlans = arrayMove(plans, oldIndex, newIndex)
    setPlans(nextPlans)
    void saveOrder(nextPlans, previousPlans)
  }

  async function attachSelectedPlan() {
    if (!selectedPlanId) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: selectedPlanId, goal_id: goalId }),
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, "添加已有计划失败"))
      }
      setSelectedPlanId("")
      await loadPlans()
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : "添加已有计划失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border bg-gray-50 p-3 dark:bg-gray-900">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">目标执行路线</div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
            <SelectTrigger className="h-8 w-full bg-white sm:w-[220px]">
              <SelectValue placeholder="添加未归属计划" />
            </SelectTrigger>
            <SelectContent>
              {unassignedPlans.length === 0 ? (
                <SelectItem value="none" disabled>暂无未归属计划</SelectItem>
              ) : unassignedPlans.map(plan => (
                <SelectItem key={plan.plan_id} value={plan.plan_id}>{plan.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" disabled={!selectedPlanId || saving} onClick={() => void attachSelectedPlan()}>
            添加已有
          </Button>
          <Button type="button" size="sm" onClick={() => router.push(`/plans?goal_id=${encodeURIComponent(goalId)}`)}>
            <Plus className="h-4 w-4" />
            新建计划
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-500">加载关联计划...</div>
      ) : plans.length === 0 ? (
        <div className="rounded border border-dashed bg-white py-6 text-center text-sm text-gray-500 dark:bg-gray-950">
          暂无关联计划
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={plans.map(plan => plan.plan_id)} strategy={verticalListSortingStrategy}>
            <div className="overflow-x-auto rounded border bg-white dark:bg-gray-950">
              <div className="min-w-[760px]">
                {plans.map((plan, index) => (
                  <SortablePlanRow key={plan.plan_id} plan={plan} index={index} />
                ))}
              </div>
            </div>
          </SortableContext>
        </DndContext>
      )}

      {saving ? <div className="mt-2 text-xs text-gray-500">保存中...</div> : null}
    </div>
  )
}
```

- [ ] **Step 2: Update goals page imports and types**

In `src/app/goals/page.tsx`, remove the unused router behavior if no longer needed for `/plans?tag=...`:

```ts
import { ChevronDown, ChevronRight } from 'lucide-react'
import { GoalPlanList } from "@/components/goals/goal-plan-list"
```

Keep `useRouter` only if another remaining action needs it. Otherwise remove:

```ts
import { useRouter } from 'next/navigation'
```

and remove:

```ts
const router = useRouter();
```

- [ ] **Step 3: Add expanded goal state**

Inside `GoalsPage`, after `const [tagOptions, setTagOptions] = useState<string[]>([])`, add:

```ts
const [expandedGoalIds, setExpandedGoalIds] = useState<Set<string>>(() => new Set())

const toggleGoalExpanded = (goalId: string) => {
  setExpandedGoalIds(current => {
    const next = new Set(current)
    if (next.has(goalId)) {
      next.delete(goalId)
    } else {
      next.add(goalId)
    }
    return next
  })
}
```

- [ ] **Step 4: Replace goal table rendering**

In `src/app/goals/page.tsx`, change the table minimum width and headers:

```tsx
<Table className="min-w-[980px] w-full">
  <TableHeader>
    <TableRow>
      <TableHead className="w-[48px] min-w-[48px]"></TableHead>
      <TableHead className="w-[220px] min-w-[220px]">名称</TableHead>
      <TableHead className="w-[140px] min-w-[140px]">标签</TableHead>
      <TableHead className="w-[380px] min-w-[380px]">描述</TableHead>
      <TableHead className="sticky right-0 z-[1] w-[190px] min-w-[190px] border-l bg-white shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] dark:bg-gray-950">操作</TableHead>
    </TableRow>
  </TableHeader>
```

Change empty-state colspans from `4` to `5`.

Replace the `goals.map(goal => (...))` block with:

```tsx
goals.map(goal => {
  const expanded = expandedGoalIds.has(goal.goal_id)

  return (
    <React.Fragment key={goal.goal_id}>
      <TableRow>
        <TableCell className="w-[48px] min-w-[48px]">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label={expanded ? "收起关联计划" : "展开关联计划"}
            onClick={() => toggleGoalExpanded(goal.goal_id)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="w-[220px] min-w-[220px] font-medium">
          <TextPreview
            text={goal.name}
            maxLength={50}
            className="font-medium"
            truncateLines={2}
          />
        </TableCell>
        <TableCell className="w-[140px] min-w-[140px]">
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {goal.tag}
          </span>
        </TableCell>
        <TableCell className="w-[380px] min-w-[380px]">
          <MarkdownPreview
            content={goal.description || ''}
            maxLines={2}
            showToggle={true}
          />
        </TableCell>
        <TableCell className="sticky right-0 z-[1] w-[190px] min-w-[190px] border-l bg-white shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] dark:bg-gray-950">
          <div className="flex flex-wrap gap-1 items-center justify-start">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleEdit(goal)}
              className="h-8 px-2 text-xs"
              disabled={loading}
            >
              编辑
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleDelete(goal.goal_id)}
              className="h-8 px-2 text-xs"
              disabled={loading}
            >
              删除
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-gray-50 p-3 dark:bg-gray-900">
            <GoalPlanList goalId={goal.goal_id} />
          </TableCell>
        </TableRow>
      ) : null}
    </React.Fragment>
  )
})
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- src/app/api/plan/route.test.ts src/app/api/plan/order/route.test.ts src/lib/plan-goal-utils.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit goal page expansion**

Run:

```bash
git add src/components/goals/goal-plan-list.tsx src/app/goals/page.tsx
git commit -m "feat: show goal plan routes"
```

---

### Task 5: Plan Page Goal Selection

**Files:**
- Modify: `src/app/plans/page.tsx`

- [ ] **Step 1: Extend local types**

In `src/app/plans/page.tsx`, add:

```ts
interface GoalOption {
  goal_id: string
  name: string
  tag: string
}
```

Extend `Plan`:

```ts
  goal_id?: string | null
  goal_position?: number | null
  goal?: GoalOption | null
```

Extend `PlanForm`:

```ts
  goal_id?: string | null;
```

- [ ] **Step 2: Add goal state and URL goal handling**

After tag state declarations, add:

```ts
const [goalOptions, setGoalOptions] = useState<GoalOption[]>([])
const [goalFilter, setGoalFilter] = useState('all')
```

Add this effect near the tag-loading effect:

```ts
useEffect(() => {
  fetch('/api/goal?pageSize=1000')
    .then(res => res.json())
    .then(data => setGoalOptions(data.list || []))
}, [])
```

In the existing `useEffect` that reads URL params, add:

```ts
const urlGoalId = searchParams.get('goal_id');
if (urlGoalId && goalFilter !== urlGoalId) {
  setGoalFilter(urlGoalId);
  setForm(f => ({ ...f, goal_id: urlGoalId }));
}
```

Include `goalFilter` in that effect dependency list.

- [ ] **Step 3: Update fetchPlans to pass strict goal filter**

In `fetchPlans`, after `const params = new URLSearchParams({ pageSize: '1000' })`, add:

```ts
if (goalFilter !== 'all') {
  if (goalFilter === 'unassigned') {
    params.set('unassigned', 'true')
  } else {
    params.set('goal_id', goalFilter)
  }
}
```

Update the initial fetch effect:

```ts
useEffect(() => {
  fetchPlans();
}, [goalFilter])
```

- [ ] **Step 4: Update client-side filter**

Inside `filterPlans`, before `return nameMatch && ...`, add:

```ts
const goalMatch = goalFilter === 'all' ||
  (goalFilter === 'unassigned' && !plan.goal_id) ||
  plan.goal_id === goalFilter;
```

Change the return line to include `goalMatch`:

```ts
return nameMatch && tagMatch && difficultyMatch && taskTypeMatch && progressMatch && goalMatch;
```

Add `goalFilter` to the dependency arrays of the two effects that recalculate filtered plans.

- [ ] **Step 5: Add goal selector to the form**

Change the form grid class from:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
```

to:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-4">
```

Insert this field after difficulty:

```tsx
<div className="space-y-2">
  <Label htmlFor="goal_id">所属目标</Label>
  <Select
    value={form.goal_id || 'unassigned'}
    onValueChange={v => setForm(f => ({ ...f, goal_id: v === 'unassigned' ? null : v }))}
  >
    <SelectTrigger id="goal_id" className="w-full">
      <SelectValue placeholder="选择目标" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="unassigned">未归属</SelectItem>
      {goalOptions.map(goal => (
        <SelectItem key={goal.goal_id} value={goal.goal_id}>
          {goal.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

In `handleEdit`, include:

```ts
goal_id: plan.goal_id || null,
```

In the cancel button, reset to:

```ts
setForm({ tags: [], progress: '', is_recurring: false, goal_id: goalFilter !== 'all' && goalFilter !== 'unassigned' ? goalFilter : null });
```

- [ ] **Step 6: Add goal filter control**

In the filter grid, change `xl:grid-cols-5` to `xl:grid-cols-6`.

Insert this filter after search:

```tsx
<div className="space-y-2">
  <Label>筛选目标</Label>
  <Select value={goalFilter} onValueChange={setGoalFilter}>
    <SelectTrigger className="w-full">
      <SelectValue placeholder="全部目标" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">全部目标</SelectItem>
      <SelectItem value="unassigned">未归属</SelectItem>
      {goalOptions.map(goal => (
        <SelectItem key={goal.goal_id} value={goal.goal_id}>
          {goal.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 7: Add goal column to the table**

Change table width from `1200px` to `1320px`, and `min-w-[1200px]` to `min-w-[1320px]`.

Add a header after plan name:

```tsx
<TableHead className="w-[140px] min-w-[140px]" style={{ width: '140px', maxWidth: '140px' }}>所属目标</TableHead>
```

Add a cell after the plan name cell:

```tsx
<TableCell className="w-[140px] min-w-[140px]" style={{ width: '140px', maxWidth: '140px' }}>
  {plan.goal ? (
    <span className="inline-flex max-w-full rounded bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
      <span className="truncate">{plan.goal.name}</span>
    </span>
  ) : (
    <span className="text-xs text-gray-400">未归属</span>
  )}
</TableCell>
```

Update loading/empty `colSpan` from `6` to `7`.

- [ ] **Step 8: Run targeted tests**

Run:

```bash
npm test -- src/app/api/plan/route.test.ts src/app/api/plan/order/route.test.ts src/lib/plan-goal-utils.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit plan page integration**

Run:

```bash
git add src/app/plans/page.tsx
git commit -m "feat: choose plan goal ownership"
```

---

### Task 6: CopilotKit Create Plan Goal Binding

**Files:**
- Modify: `src/app/api/copilotkit/route.ts`

- [ ] **Step 1: Add `goal_id` parameter to `createPlan`**

In the `createPlan` action parameters, after `tags`, add:

```ts
        {
          name: "goal_id",
          type: "string",
          description: "可选。计划所属目标的 goal_id；如果用户明确指定目标，应先查询目标后传入该字段。",
          required: false,
        }
```

- [ ] **Step 2: Validate and save `goal_id` in the handler**

Change:

```ts
const { name, description, difficulty, tags } = args;
```

to:

```ts
const { name, description, difficulty, tags, goal_id } = args;
```

Before creating the plan, add:

```ts
let goalPosition: number | null = null;
if (goal_id) {
  const existingGoal = await prisma.goal.findUnique({ where: { goal_id } });
  if (!existingGoal) {
    return {
      success: false,
      error: `目标不存在：${goal_id}`,
    };
  }

  const positionResult = await prisma.plan.aggregate({
    where: { goal_id },
    _max: { goal_position: true },
  });
  goalPosition = (positionResult._max.goal_position ?? 0) + 1000;
}
```

In `prisma.plan.create`, add:

```ts
              ...(goal_id ? { goal_id, goal_position: goalPosition } : {}),
```

The final `data` object should be:

```ts
            data: {
              plan_id,
              name,
              description: description || '',
              difficulty: difficulty,
              progress: 0,
              ...(goal_id ? { goal_id, goal_position: goalPosition } : {}),
            }
```

- [ ] **Step 3: Update system prompt wording**

In the system prompt section about creating plans, add this bullet under tag handling or plan creation guidance:

```text
   - **目标归属**：如果计划明显服务于某个已有目标，先查询目标并在创建计划时传入对应 goal_id；如果不确定归属，先向用户确认。
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- src/app/api/plan/route.test.ts src/app/api/plan/order/route.test.ts src/lib/plan-goal-utils.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit CopilotKit update**

Run:

```bash
git add src/app/api/copilotkit/route.ts
git commit -m "feat: let ai bind plans to goals"
```

---

### Task 7: Database Sync And Manual Verification

**Files:**
- No new source files.
- This task verifies schema, API, and UI behavior.

- [ ] **Step 1: Push schema to local database**

Run:

```bash
npm run db:push
```

Expected: Prisma reports the database is in sync. Existing plans remain present with `goal_id = null` and `goal_position = null`.

- [ ] **Step 2: Run all targeted tests**

Run:

```bash
npm test -- src/lib/plan-goal-utils.test.ts src/app/api/plan/route.test.ts src/app/api/plan/order/route.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the development server**

Run:

```bash
npm run dev
```

Expected: Next.js starts and prints a local URL, usually `http://localhost:3000`.

- [ ] **Step 4: Manually verify target flow in browser**

Open `http://localhost:3000/goals` and verify:

1. Each target row has an expand/collapse icon on the left.
2. Expanding a goal shows “目标执行路线”.
3. A goal with no linked plans shows “暂无关联计划”.
4. Clicking “新建计划” opens `/plans?goal_id=<goal_id>`.
5. Creating a plan from that state defaults “所属目标” to the selected goal.
6. Returning to `/goals` and expanding the goal shows the new plan.
7. Add at least two plans to the same goal.
8. Drag the second plan above the first.
9. Refresh the page and confirm the order persists.
10. Attach an unassigned plan through “添加已有”, then confirm it appears at the end.

- [ ] **Step 5: Manually verify non-regression**

Verify:

1. `/plans` still lists existing plans.
2. Plan search, tag filter, difficulty filter, progress filter, and task type filter still work.
3. Editing a plan can set “所属目标” to “未归属”.
4. `/progress?plan_id=<plan_id>` still opens for a routed plan.
5. Homepage four-quadrant sidebar still loads scheduled plans.

- [ ] **Step 6: Stop the dev server**

Stop the running `npm run dev` process with `Ctrl-C`.

- [ ] **Step 7: Commit verification notes if code changed during verification**

If manual verification required fixes, commit only those fixes:

```bash
git status --short
git add <fixed-files>
git commit -m "fix: polish goal plan route"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage: schema ownership, inline goal expansion, same-goal drag sorting, strict `/api/plan?goal_id=...`, create/update goal binding, AI createPlan binding, and manual browser verification are covered.
- Intentional deviation: component tests from the spec are replaced with API/helper tests plus manual browser verification because the current project has Node-only Vitest and no React component test dependencies.
- Scope guard: no cross-goal drag, no target detail page, no automatic old-data backfill, and no progress-unit cleanup.
- Type consistency: use `goal_id`, `goal_position`, `GoalOption`, and `GoalPlan` consistently across API and UI tasks.
