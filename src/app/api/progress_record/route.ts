import { NextRequest } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { journalHttp, journalJson } from '@/lib/journal/http'
import { progressInput } from '@/lib/journal/progress-input'
import { parseProgressDelete, invalid } from '@/lib/journal/validation'
import { createProgressRecord, updateProgressRecord, getProgressRecord, deleteProgressRecord } from '@/lib/progress-record-service'
const prisma = new PrismaClient()
export async function GET(request: NextRequest) {
  return journalHttp(async () => {
    const params = request.nextUrl.searchParams
    if (params.has('id')) return getProgressRecord(prisma, parseProgressDelete(params).id)
    const pageNum = Number(params.get('pageNum') ?? 1), pageSize = Number(params.get('pageSize') ?? 10)
    if (!Number.isSafeInteger(pageNum) || pageNum < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) invalid('分页参数无效')
    const planId = params.get('plan_id'), where = planId ? { plan_id: planId } : {}
    const [list, total] = await Promise.all([
      prisma.progressRecord.findMany({ where, skip: (pageNum - 1) * pageSize, take: pageSize, orderBy: { gmt_create: 'desc' } }),
      prisma.progressRecord.count({ where }),
    ])
    return { list, total }
  })
}
export async function POST(request: NextRequest) {
  return journalHttp(async () => createProgressRecord(prisma, progressInput(await journalJson(request), false)), 201)
}
export async function PUT(request: NextRequest) {
  return journalHttp(async () => updateProgressRecord(prisma, progressInput(await journalJson(request), true)))
}
export async function DELETE(request: NextRequest) {
  return journalHttp(() => deleteProgressRecord(prisma, parseProgressDelete(request.nextUrl.searchParams)))
}
