import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET: ListProgressRecords 支持分页和plan_id筛选
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const plan_id = searchParams.get('plan_id')
  const pageNum = parseInt(searchParams.get('pageNum') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '10')
  const where = plan_id ? { plan_id } : {}
  const [records, total] = await Promise.all([
    prisma.progressRecord.findMany({
      where,
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
      orderBy: { gmt_create: 'desc' }
    }),
    prisma.progressRecord.count({ where })
  ])
  return NextResponse.json({ list: records, total })
}

// POST: InsertProgressRecord
export async function POST(req: NextRequest) {
  const data = await req.json()
  const record = await prisma.progressRecord.create({ data })
  return NextResponse.json(record)
}

// PUT: UpdateProgressRecord
export async function PUT(req: NextRequest) {
  const data = await req.json()
  const { id, ...rest } = data
  const record = await prisma.progressRecord.update({
    where: { id },
    data: rest
  })
  return NextResponse.json(record)
}

// DELETE: DeleteProgressRecord
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = parseInt(searchParams.get('id') || '0')
  await prisma.progressRecord.delete({ where: { id } })
  return NextResponse.json({ success: true })
} 