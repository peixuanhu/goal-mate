import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

// GET: ListGoals 支持分页和tag筛选
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tag = searchParams.get('tag')
  const pageNum = parseInt(searchParams.get('pageNum') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '10')
  const where = tag ? { tag } : {}
  const [goals, total] = await Promise.all([
    prisma.goal.findMany({
      where,
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
      orderBy: { gmt_create: 'desc' }
    }),
    prisma.goal.count({ where })
  ])
  return NextResponse.json({ list: goals, total })
}

// POST: InsertGoal
export async function POST(req: NextRequest) {
  const data = await req.json()
  const goal = await prisma.goal.create({ data: { ...data, goal_id: `goal_${randomUUID().replace(/-/g, '').substring(0, 10)}` } })
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