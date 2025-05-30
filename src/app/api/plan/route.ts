import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

// GET: ListPlans 支持分页、tag、difficulty、goal_id筛选
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tag = searchParams.get('tag')
  const difficulty = searchParams.get('difficulty')
  const goal_id = searchParams.get('goal_id')
  const pageNum = parseInt(searchParams.get('pageNum') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '10')

  let where: any = {}
  if (difficulty) where.difficulty = difficulty

  // goal_id筛选时，取goal的tag，过滤出带该tag的plan
  if (goal_id) {
    const goal = await prisma.goal.findUnique({ where: { goal_id } })
    if (goal) {
      const tag = goal.tag
      where.tags = { some: { tag } }
    }
  } else if (tag) {
    where.tags = { some: { tag } }
  }

  const [plans, total] = await Promise.all([
    prisma.plan.findMany({
      where,
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
      orderBy: { gmt_create: 'desc' },
      include: { tags: true }
    }),
    prisma.plan.count({ where })
  ])

  // 返回时加上tags属性（字符串数组）
  const result = plans.map(plan => ({
    ...plan,
    tags: plan.tags.map(t => t.tag)
  }))

  return NextResponse.json({ list: result, total })
}

// POST: InsertPlan
export async function POST(req: NextRequest) {
  const data = await req.json()
  const { tags, ...planData } = data
  const plan = await prisma.plan.create({
    data: { ...planData, plan_id: `plan_${randomUUID().replace(/-/g, '').substring(0, 10)}` }
  })
  // 插入tags
  if (tags && Array.isArray(tags)) {
    await Promise.all(tags.map((tag: string) =>
      prisma.planTagAssociation.create({ data: { plan_id: plan.plan_id, tag } })
    ))
  }
  return NextResponse.json(plan)
}

// PUT: UpdatePlan
export async function PUT(req: NextRequest) {
  const data = await req.json()
  const { plan_id, tags, ...rest } = data
  const plan = await prisma.plan.update({
    where: { plan_id },
    data: rest
  })
  // 更新tags
  if (tags && Array.isArray(tags)) {
    await prisma.planTagAssociation.deleteMany({ where: { plan_id } })
    await Promise.all(tags.map((tag: string) =>
      prisma.planTagAssociation.create({ data: { plan_id, tag } })
    ))
  }
  return NextResponse.json(plan)
}

// DELETE: DeletePlan
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const plan_id = searchParams.get('plan_id') || undefined
  if (!plan_id) return NextResponse.json({ success: false, message: 'plan_id required' }, { status: 400 })
  await prisma.plan.delete({ where: { plan_id } })
  return NextResponse.json({ success: true })
} 