import { PrismaClient } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

import { loadTodayView } from "@/lib/today/query"
import { parseDateKey } from "@/lib/today/validation"

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
  let date: string
  try {
    date = parseDateKey(new URL(req.url).searchParams.get("date"))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "date must be a valid yyyy-mm-dd value" },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json(await loadTodayView(prisma, date))
  } catch (error) {
    console.error("[today] loadTodayView failed", error)
    return NextResponse.json({ error: "今日数据加载失败" }, { status: 500 })
  }
}
