import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient, type Prisma } from '@prisma/client'
import { createGoalAtEnd, lockGoalOrder } from '@/lib/goal-order'

const prisma = new PrismaClient()

const GOAL_ORDER: Prisma.GoalOrderByWithRelationInput[] = [
  { position: { sort: 'asc', nulls: 'last' } },
  { gmt_create: 'desc' },
  { goal_id: 'asc' },
]

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// GET: ListGoals 支持分页和tag筛选
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tag = searchParams.get('tag')
  const all = searchParams.get('all') === 'true'
  const pageNum = parseInt(searchParams.get('pageNum') || '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') || '10', 10)
  const where: Prisma.GoalWhereInput = all ? {} : tag ? { tag } : {}
  const [goals, total] = await Promise.all([
    all
      ? prisma.goal.findMany({ where, orderBy: GOAL_ORDER })
      : prisma.goal.findMany({
        where,
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        orderBy: GOAL_ORDER,
      }),
    prisma.goal.count({ where })
  ])
  return NextResponse.json({ list: goals, total })
}

// POST: InsertGoal
export async function POST(req: NextRequest) {
  const data: unknown = await req.json()
  if (!isPlainObject(data)) {
    return NextResponse.json({ error: '请求体必须是有效 JSON 对象' }, { status: 400 })
  }

  const { name, tag, description } = data
  if (typeof name !== 'string' || typeof tag !== 'string') {
    return NextResponse.json({ error: 'name 和 tag 必须是字符串' }, { status: 400 })
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return NextResponse.json({ error: 'description 必须是字符串或 null' }, { status: 400 })
  }

  const goal = await createGoalAtEnd(prisma, {
    name,
    tag,
    ...(description === undefined ? {} : { description }),
  })
  return NextResponse.json(goal)
}

// PUT: UpdateGoal
export async function PUT(req: NextRequest) {
  const data = await req.json()
  const { goal_id, ...rest } = data
  delete rest.position
  const goal = await prisma.goal.update({
    where: { goal_id },
    data: rest
  })
  return NextResponse.json(goal)
}

// DELETE: DeleteGoal
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const goal_id = searchParams.get('goal_id') || undefined
  if (!goal_id) return NextResponse.json({ success: false, message: 'goal_id required' }, { status: 400 })
  await prisma.$transaction(async tx => {
    await lockGoalOrder(tx)
    await tx.goal.delete({ where: { goal_id } })
  })
  return NextResponse.json({ success: true })
}
