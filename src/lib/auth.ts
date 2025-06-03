import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

// 获取JWT密钥
const getJWTSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is not set');
  }
  return secret;
};

// 创建JWT令牌
export function createToken(username: string): string {
  return jwt.sign({ username }, getJWTSecret(), { expiresIn: '7d' });
}

// 验证JWT令牌
export function verifyToken(token: string): { username: string } | null {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      console.error('AUTH_SECRET environment variable is not set');
      return null;
    }
    
    const payload = jwt.verify(token, secret) as { username: string };
    return payload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

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
  } catch (error) {
    console.error('Get current user failed:', error);
    return null;
  }
}

// 检查是否已登录
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
} 