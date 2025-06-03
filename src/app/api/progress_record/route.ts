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
    
    // 处理自定义时间
    const createData: {
      plan_id: string;
      content: string;
      thinking: string;
      gmt_create?: Date;
    } = {
      plan_id: data.plan_id,
      content: data.content || '',
      thinking: data.thinking || ''
    }
    
    // 如果提供了自定义时间，使用该时间
    if (data.custom_time) {
      // 确保时间格式正确处理
      const customDate = new Date(data.custom_time);
      // 如果是YYYY-MM-DDTHH:mm格式，需要明确指定为本地时间
      if (data.custom_time.length === 16 && data.custom_time.includes('T')) {
        // 解析为本地时间而不是UTC
        const [datePart, timePart] = data.custom_time.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute] = timePart.split(':').map(Number);
        createData.gmt_create = new Date(year, month - 1, day, hour, minute);
      } else {
        createData.gmt_create = customDate;
      }
    }
    // 否则Prisma会自动使用当前时间（@default(now())）
    
    const record = await prisma.progressRecord.create({
      data: createData
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
    const { id, content, thinking, custom_time, plan_id } = data
    
    if (!id) {
      return NextResponse.json(
        { error: '缺少记录ID' }, 
        { status: 400 }
      )
    }
    
    const updateData: {
      content: string;
      thinking: string;
      plan_id?: string;
      gmt_create?: Date;
    } = {
      content: content || '',
      thinking: thinking || ''
    }
    
    // 如果提供了plan_id，更新所属计划
    if (plan_id) {
      updateData.plan_id = plan_id;
    }
    
    // 如果提供了自定义时间，更新时间
    if (custom_time) {
      // 确保时间格式正确处理
      if (custom_time.length === 16 && custom_time.includes('T')) {
        // 解析为本地时间而不是UTC
        const [datePart, timePart] = custom_time.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute] = timePart.split(':').map(Number);
        updateData.gmt_create = new Date(year, month - 1, day, hour, minute);
      } else {
        updateData.gmt_create = new Date(custom_time);
      }
    }
    
    const record = await prisma.progressRecord.update({
      where: { id: parseInt(id) },
      data: updateData
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