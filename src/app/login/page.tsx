import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export default async function LoginPage() {
  // 如果已经登录，重定向到主页
  if (await isAuthenticated()) {
    redirect('/');
  }

  return <LoginForm />;
} 