import { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'
import { journalHttp, journalJson } from '@/lib/journal/http'
import { createJournalEvent, updateJournalEvent, deleteJournalEvent } from '@/lib/journal/event-service'
import { parseEventDelete, parseEventInput, parseEventUpdate } from '@/lib/journal/validation'
const prisma = new PrismaClient()
export async function POST(request: NextRequest) {
  return journalHttp(async () => createJournalEvent(prisma, parseEventInput(await journalJson(request))), 201)
}
export async function PUT(request: NextRequest) {
  return journalHttp(async () => updateJournalEvent(prisma, parseEventUpdate(await journalJson(request))))
}
export async function DELETE(request: NextRequest) {
  return journalHttp(() => deleteJournalEvent(prisma, parseEventDelete(request.nextUrl.searchParams)))
}
