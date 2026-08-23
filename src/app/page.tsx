import { redirect } from 'next/navigation';

import { TodayWorkspace } from '@/components/today/today-workspace';
import { isAuthenticated } from '@/lib/auth';

export default async function Home() {
  // 服务器端身份验证检查
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect('/login');
  }

  return <TodayWorkspace />;
}
