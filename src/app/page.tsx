import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MainLayout } from "@/components/main-layout";
import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

export default async function Home() {
  // 服务器端身份验证检查
  const authenticated = await isAuthenticated();
  
  if (!authenticated) {
    redirect('/login');
  }

  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center gap-8 bg-muted p-8 min-h-screen">
        <h1 className="text-3xl font-bold mb-8">Goal Mate - AI智能目标管理</h1>
        <div className="flex flex-wrap gap-8 justify-center">
          <Card className="w-64">
            <CardHeader>
              <CardTitle>目标管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                创建和管理你的长期目标
              </p>
              <Button asChild className="w-full mt-2">
                <Link href="/goals">进入目标管理</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="w-64">
            <CardHeader>
              <CardTitle>计划管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                制定具体的执行计划和任务
              </p>
              <Button asChild className="w-full mt-2">
                <Link href="/plans">进入计划管理</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="w-64">
            <CardHeader>
              <CardTitle>进展记录</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                跟踪和记录你的进展情况
              </p>
              <Button asChild className="w-full mt-2">
                <Link href="/progress">进入进展记录</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        
        {/* AI助手使用提示 */}
        <Card className="w-full max-w-2xl mt-8">
          <CardHeader>
            <CardTitle>🤖 AI助手使用指南</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p><strong>你可以这样与AI助手对话：</strong></p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>&quot;刚下班有点累，我现在能做些什么轻松的事？&quot;</li>
                <li>&quot;我现在活力满满，根据我制定的计划的完成情况，我现在合适的任务有哪些？&quot;</li>
                <li>&quot;我本年的读书计划完成得如何？&quot;</li>
                <li>&quot;我想读《DDIA》，这本书难度比较高，你帮我新加一条计划&quot;</li>
                <li>&quot;我把《CSAPP》第3章读完了，你帮我更新进度&quot;</li>
                <li>&quot;根据我的目标以及完成事项的记录，按照目标类型来分不同板块，生成本周周报&quot;</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
