import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET: ListTags
export async function GET() {
  const goals = await prisma.goal.findMany({ select: { tag: true } })
  const tags = Array.from(new Set(goals.map(g => g.tag)))
  return NextResponse.json(tags)
} 