import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

import {
  buildWeeklyReportSummary,
  formatDateOnly,
  getShanghaiWeekRange,
  type WeeklyReportSourceRecord,
} from "@/lib/weekly-report"

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const weekStartParam = searchParams.get("weekStart") || undefined
  const range = getShanghaiWeekRange(weekStartParam)

  const records = await prisma.progressRecord.findMany({
    where: {
      gmt_create: {
        gte: range.queryStart,
        lte: range.queryEnd,
      },
    },
    orderBy: { gmt_create: "desc" },
    include: {
      plan: {
        select: {
          plan_id: true,
          name: true,
          progress: true,
          goal: {
            select: {
              goal_id: true,
              name: true,
              tag: true,
            },
          },
        },
      },
    },
  })

  const summary = buildWeeklyReportSummary({
    weekStart: formatDateOnly(range.weekStart),
    weekEnd: formatDateOnly(range.weekEnd),
    records: records as WeeklyReportSourceRecord[],
  })

  return NextResponse.json(summary)
}
