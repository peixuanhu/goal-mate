import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

// GET: ListReports 支持分页
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pageNum = parseInt(searchParams.get('pageNum') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '10')
  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
      orderBy: { gmt_create: 'desc' }
    }),
    prisma.report.count()
  ])
  return NextResponse.json({ list: reports, total })
}

// POST: InsertReport
export async function POST(req: NextRequest) {
  const data = await req.json()
  const report = await prisma.report.create({ data: { ...data, report_id: `report_${randomUUID().replace(/-/g, '').substring(0, 10)}` } })
  return NextResponse.json(report)
}

// PUT: UpdateReport
export async function PUT(req: NextRequest) {
  const data = await req.json()
  const { report_id, ...rest } = data
  const report = await prisma.report.update({
    where: { report_id },
    data: rest
  })
  return NextResponse.json(report)
}

// DELETE: DeleteReport
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const report_id = searchParams.get('report_id') || undefined
  if (!report_id) return NextResponse.json({ success: false, message: 'report_id required' }, { status: 400 })
  await prisma.report.delete({ where: { report_id } })
  return NextResponse.json({ success: true })
} 