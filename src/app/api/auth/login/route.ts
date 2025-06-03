import { NextRequest, NextResponse } from 'next/server';
import { validateCredentials, createToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    
    if (!username || !password) {
      return NextResponse.json(
        { error: '用户名和密码不能为空' },
        { status: 400 }
      );
    }
    
    // 验证凭据
    if (!validateCredentials(username, password)) {
      return NextResponse.json(
        { error: '用户名或密码错误' },
        { status: 401 }
      );
    }
    
    // 创建JWT令牌
    const token = createToken(username);
    
    // 设置cookie
    const cookieStore = await cookies();
    cookieStore.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7天
      path: '/',
    });
    
    return NextResponse.json({ 
      success: true, 
      message: '登录成功',
      user: { username }
    });
    
  } catch (error) {
    console.error('登录错误:', error);
    return NextResponse.json(
      { error: '登录过程中发生错误' },
      { status: 500 }
    );
  }
} 