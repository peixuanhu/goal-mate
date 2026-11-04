import { NextResponse } from 'next/server'
import { getCurrentUser } from './auth'

export async function requireApiAuth(): Promise<NextResponse | null> {
  if (!await getCurrentUser()) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  return null
}
