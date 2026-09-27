import { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'
import { journalHttp, journalJson } from '@/lib/journal/http'
import { putManualMeasurement, clearMeasurement } from '@/lib/journal/measurement-service'
import { parseMeasurementInput } from '@/lib/journal/validation'
const prisma = new PrismaClient()
export async function PUT(request: NextRequest) {
  return journalHttp(async () => putManualMeasurement(prisma, parseMeasurementInput(await journalJson(request))))
}
export async function DELETE(request: NextRequest) {
  return journalHttp(async () => {
    const params = request.nextUrl.searchParams
    return clearMeasurement(prisma, parseMeasurementInput({ tracker_id: params.get('tracker_id'), date: params.get('date'), expected_version: Number(params.get('expected_version')), request_id: params.get('request_id'), value: null, status: 'cleared', note: '' }))
  })
}
