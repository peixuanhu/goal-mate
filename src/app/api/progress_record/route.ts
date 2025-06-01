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

// POST: CreateProgressRecord
export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const record = await prisma.progressRecord.create({
      data: {
        plan_id: data.plan_id,
        content: data.content || '',
        thinking: data.thinking || ''
      }
    })
    return NextResponse.json(record)
  } catch (error) {
    console.error('创建进展记录失败:', error)
    return NextResponse.json(
      { error: '创建进展记录失败' }, 
      { status: 500 }
    )
  }
}

// PUT: UpdateProgressRecord
export async function PUT(req: NextRequest) {
  try {
    const data = await req.json()
    const { id, content, thinking } = data
    
    if (!id) {
      return NextResponse.json(
        { error: '缺少记录ID' }, 
        { status: 400 }
      )
    }
    
    const record = await prisma.progressRecord.update({
      where: { id: parseInt(id) },
      data: {
        content: content || '',
        thinking: thinking || ''
      }
    })
    
    return NextResponse.json(record)
  } catch (error) {
    console.error('更新进展记录失败:', error)
    return NextResponse.json(
      { error: '更新进展记录失败' }, 
      { status: 500 }
    )
  }
}

// DELETE: DeleteProgressRecord
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: '缺少记录ID' }, 
        { status: 400 }
      )
    }
    
    await prisma.progressRecord.delete({
      where: { id: parseInt(id) }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除进展记录失败:', error)
    return NextResponse.json(
      { error: '删除进展记录失败' }, 
      { status: 500 }
    )
  }
} 