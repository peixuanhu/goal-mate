import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    
    // 删除认证cookie
    cookieStore.delete('auth-token');
    
    return NextResponse.json({ 
      success: true, 
      message: '退出登录成功' 
    });
    
  } catch (error) {
    console.error('退出登录错误:', error);
    return NextResponse.json(
      { error: '退出登录过程中发生错误' },
      { status: 500 }
    );
  }
} 