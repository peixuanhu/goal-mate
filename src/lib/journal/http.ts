import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { JournalError } from './types'
export async function journalHttp(run: () => Promise<unknown>, status = 200) {
  try {
    if (!await getCurrentUser()) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    return NextResponse.json(await run(), { status })
  } catch (error) {
    if (error instanceof JournalError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === 'VALIDATION' ? 400 : error.code === 'NOT_FOUND' ? 404 : 409 })
    console.error('journal request failed', error)
    return NextResponse.json({ error: '请求失败，请重试' }, { status: 500 })
  }
}
export async function journalJson(request: Request): Promise<unknown> {
  try { return await request.json() }
  catch { throw new JournalError('VALIDATION', '请求必须是有效 JSON') }
}
