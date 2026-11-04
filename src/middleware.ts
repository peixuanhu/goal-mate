import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from './lib/auth-token'

const publicAssets = new Set([
  '/favicon.ico',
  '/icon.svg',
  '/file.svg',
  '/globe.svg',
  '/next.svg',
  '/vercel.svg',
  '/window.svg',
])

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/mcp' || // MCP independently verifies its Bearer token.
    pathname.startsWith('/_next/static/') ||
    pathname === '/_next/image' ||
    publicAssets.has(pathname)
  ) return NextResponse.next()

  const token = request.cookies.get('auth-token')?.value
  if (token && verifyToken(token)) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  return NextResponse.redirect(new URL('/login', request.url))
}

// Next.js 15.5 supports Node middleware; this shares the route JWT verifier.
export const config = {
  matcher: ['/:path*'],
  runtime: 'nodejs',
}
