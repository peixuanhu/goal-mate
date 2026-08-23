import { PrismaClient } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

import { loadTodayView } from "@/lib/today/query"
import { parseDateKey } from "@/lib/today/validation"

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
  try {
    const date = parseDateKey(new URL(req.url).searchParams.get("date"))
    return NextResponse.json(await loadTodayView(prisma, date))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "今日数据加载失败" },
      { status: 400 },
    )
  }
}
