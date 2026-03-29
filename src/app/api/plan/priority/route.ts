import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET: 获取已安排到四象限的任务列表（按象限分组）
export async function GET() {
  try {
    const plans = await prisma.plan.findMany({
      where: {
        is_scheduled: true,
        priority_quadrant: { not: null }
      },
      orderBy: { name: 'asc' },
      include: {
        tags: true,
        progressRecords: {
          select: { gmt_create: true },
          orderBy: { gmt_create: 'desc' }
        }
      }
    })

    // 按象限分组
    const grouped = {
      q1: plans.filter(p => p.priority_quadrant === 'q1'),
      q2: plans.filter(p => p.priority_quadrant === 'q2'),
      q3: plans.filter(p => p.priority_quadrant === 'q3'),
      q4: plans.filter(p => p.priority_quadrant === 'q4')
    }

    // 转换tags为字符串数组，并保留progressRecords
    const result = {
      q1: grouped.q1.map(plan => ({
        ...plan,
        tags: plan.tags.map(t => t.tag),
        progressRecords: plan.progressRecords || []
      })),
      q2: grouped.q2.map(plan => ({
        ...plan,
        tags: plan.tags.map(t => t.tag),
        progressRecords: plan.progressRecords || []
      })),
      q3: grouped.q3.map(plan => ({
        ...plan,
        tags: plan.tags.map(t => t.tag),
        progressRecords: plan.progressRecords || []
      })),
      q4: grouped.q4.map(plan => ({
        ...plan,
        tags: plan.tags.map(t => t.tag),
        progressRecords: plan.progressRecords || []
      }))
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching prioritized plans:', error)
    return NextResponse.json(
      { error: 'Failed to fetch prioritized plans' },
      { status: 500 }
    )
  }
}

// PUT: 更新任务象限位置
export async function PUT(req: NextRequest) {
  try {
    const data = await req.json()
    const { plan_id, priority_quadrant, is_scheduled } = data

    if (!plan_id) {
      return NextResponse.json(
        { error: 'plan_id is required' },
        { status: 400 }
      )
    }

    const updateData: {
      priority_quadrant?: string | null
      is_scheduled?: boolean
    } = {}

    if (priority_quadrant !== undefined) {
      updateData.priority_quadrant = priority_quadrant
    }

    if (is_scheduled !== undefined) {
      updateData.is_scheduled = is_scheduled
    }

    const plan = await prisma.plan.update({
      where: { plan_id },
      data: updateData,
      include: { tags: true }
    })

    return NextResponse.json({
      ...plan,
      tags: plan.tags.map(t => t.tag)
    })
  } catch (error) {
    console.error('Error updating plan priority:', error)
    return NextResponse.json(
      { error: 'Failed to update plan priority' },
      { status: 500 }
    )
  }
}
