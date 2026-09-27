import { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'
import { journalHttp, journalJson } from '@/lib/journal/http'
import { queryJournalTrackers } from '@/lib/journal/query'
import { createTracker, updateTracker, reorderTrackers, archiveTracker } from '@/lib/journal/tracker-service'
import { parseTrackerCreate, parseTrackerMutation } from '@/lib/journal/validation'
const prisma = new PrismaClient()
export async function GET() { return journalHttp(() => queryJournalTrackers(prisma)) }
export async function POST(request: NextRequest) {
  return journalHttp(async () => createTracker(prisma, parseTrackerCreate(await journalJson(request))), 201)
}
export async function PUT(request: NextRequest) {
  return journalHttp(async () => {
    const input = parseTrackerMutation(await journalJson(request))
    if (input.action === 'reorder') return reorderTrackers(prisma, input)
    if (input.action === 'archive') return archiveTracker(prisma, input)
    return updateTracker(prisma, input)
  })
}
