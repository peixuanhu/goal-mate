import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET: ListTags - 从 Goal 和 Plan 中获取所有标签
export async function GET() {
  // 从 Goal 表获取标签
  const goals = await prisma.goal.findMany({ select: { tag: true } })
  const goalTags = goals.map(g => g.tag)
  
  // 从 Plan 的关联表中获取标签
  const planTagAssociations = await prisma.planTagAssociation.findMany({ select: { tag: true } })
  const planTags = planTagAssociations.map(pt => pt.tag)
  
  // 合并并去重
  const allTags = Array.from(new Set([...goalTags, ...planTags]))
  
  return NextResponse.json(allTags)
} 