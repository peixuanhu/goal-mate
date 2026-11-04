import { cookies } from 'next/headers';
import { verifyToken } from './auth-token';

export { createToken, verifyToken } from './auth-token';

// 验证用户凭据
export function validateCredentials(username: string, password: string): boolean {
  const envUsername = process.env.AUTH_USERNAME;
  const envPassword = process.env.AUTH_PASSWORD;
  
  if (!envUsername || !envPassword) {
    console.error('AUTH_USERNAME or AUTH_PASSWORD environment variables are not set');
    return false;
  }
  
  return username === envUsername && password === envPassword;
}

// 获取当前用户
export async function getCurrentUser(): Promise<{ username: string } | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    
    if (!token) {
      return null;
    }
    
    return verifyToken(token);
  } catch {
    return null;
  }
}

// 检查是否已登录
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
} 