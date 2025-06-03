import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  console.log(`[Middleware] Processing request for: ${pathname}`);
  
  // 跳过静态文件和 Next.js 内部路径
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/login') ||
    pathname.includes('.')
  ) {
    console.log(`[Middleware] Skipping: ${pathname}`);
    return NextResponse.next();
  }
  
  // 检查身份验证token
  const token = request.cookies.get('auth-token')?.value;
  
  if (!token) {
    console.log(`[Middleware] No token found, redirecting to login`);
    // 如果是API路由，返回401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }
    // 否则重定向到登录页面
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // 简化的token验证 - 只检查是否存在
  console.log(`[Middleware] Token found, allowing access to: ${pathname}`);
  return NextResponse.next();
}

// 简化匹配器
export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}; 