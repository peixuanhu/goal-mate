import { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'
import { journalHttp } from '@/lib/journal/http'
import { queryJournalMonth } from '@/lib/journal/query'
const prisma = new PrismaClient()
export async function GET(request: NextRequest) {
  return journalHttp(() => queryJournalMonth(prisma, request.nextUrl.searchParams.get('month')))
}
