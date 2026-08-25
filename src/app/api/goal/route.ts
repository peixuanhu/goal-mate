import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient, type Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { getNextGoalPosition, lockGoalOrder } from '@/lib/goal-order'

const prisma = new PrismaClient()

const GOAL_ORDER: Prisma.GoalOrderByWithRelationInput[] = [
  { position: { sort: 'asc', nulls: 'last' } },
  { gmt_create: 'desc' },
  { goal_id: 'asc' },
]

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
  const data = await req.json() as Record<string, unknown>
  const { position: _position, ...goalData } = data
  const goal = await prisma.$transaction(async (tx) => {
    await lockGoalOrder(tx)
    const maximum = await tx.goal.aggregate({ _max: { position: true } })
    return tx.goal.create({
      data: {
        ...goalData,
        goal_id: `goal_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
        position: getNextGoalPosition(maximum._max.position),
      } as Prisma.GoalUncheckedCreateInput,
    })
  })
  return NextResponse.json(goal)
}

// PUT: UpdateGoal
export async function PUT(req: NextRequest) {
  const data = await req.json()
  const { goal_id, ...rest } = data
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
  await prisma.goal.delete({ where: { goal_id } })
  return NextResponse.json({ success: true })
}
