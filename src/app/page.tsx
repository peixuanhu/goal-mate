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
            <div className="space-y-4 text-sm">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
                <p className="font-semibold text-blue-800 mb-2">✨ 智能工作流程（核心功能）</p>
                <p className="text-sm text-blue-700 mb-2">当你提到学习进展或完成情况时，AI会：</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-600 text-xs">
                  <li>🔍 <strong>先查询你的已有计划</strong> - 自动搜索相关的目标和计划</li>
                  <li>🎯 <strong>智能匹配判断</strong> - 如果找到相关计划，直接添加进展记录</li>
                  <li>➕ <strong>按需创建</strong> - 如果没找到，才询问是否创建新的目标或计划</li>
                </ol>
                <p className="text-xs text-blue-500 mt-2 italic">💡 这样你就不需要手动指定计划，AI会自动帮你管理！</p>
              </div>
              
              <div>
                <p className="font-semibold text-green-600 mb-2">📚 智能书籍推荐</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground bg-green-50 p-3 rounded-lg">
                  <li>&quot;我想了解《深入理解计算机系统》这本书&quot;</li>
                  <li>&quot;推荐一些机器学习的入门书籍&quot;</li>
                  <li>&quot;《设计模式》这本书的章节大纲是什么？&quot;</li>
                  <li>&quot;适合初学者的Python编程书籍有哪些？&quot;</li>
                </ul>
                <p className="text-xs text-gray-500 mt-2">💡 AI会自动联网搜索并用精美的Markdown格式展示书籍信息、大纲和阅读建议</p>
              </div>
              
              <div>
                <p className="font-semibold text-orange-600 mb-2">🧠 智能进展记录</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground bg-orange-50 p-3 rounded-lg">
                  <li>&quot;我听了巴赫的众赞歌，听到第9首了。和声好神奇！&quot;</li>
                  <li>&quot;今天读完了《CSAPP》第3章，感觉汇编语言还是有点复杂&quot;</li>
                  <li>&quot;完成了Python基础语法学习，对面向对象编程有了新的理解&quot;</li>
                  <li>&quot;跑了5公里，比昨天快了30秒，但是膝盖有点酸&quot;</li>
                </ul>
                <p className="text-xs text-gray-500 mt-2">🔧 AI会自动查找相关计划并智能分析，分割成"完成事项"和"心得思考"</p>
              </div>
              
              <div>
                <p className="font-semibold text-purple-600 mb-2">🎯 智能目标/计划创建</p>
                <div className="bg-purple-50 p-3 rounded-lg space-y-2">
                  <div>
                    <p className="text-xs font-medium text-purple-700">创建目标（抽象描述）：</p>
                    <ul className="list-disc list-inside text-muted-foreground text-xs ml-2">
                      <li>&quot;我想提高编程能力&quot;</li>
                      <li>&quot;我想学会机器学习&quot;</li>
                      <li>&quot;我想提高音乐欣赏能力&quot;</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-purple-700">创建计划（具体任务）：</p>
                    <ul className="list-disc list-inside text-muted-foreground text-xs ml-2">
                      <li>&quot;我想读完《CSAPP》这本书&quot;</li>
                      <li>&quot;我想系统学习巴赫的所有众赞歌&quot;</li>
                      <li>&quot;我想每天跑步30分钟&quot;</li>
                    </ul>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">🏷️ AI会先查询已有标签，优先使用现有标签，避免重复</p>
              </div>
              
              <div>
                <p className="font-semibold text-indigo-600 mb-2">📊 智能任务管理</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground bg-indigo-50 p-3 rounded-lg">
                  <li>&quot;刚下班有点累，我现在能做些什么轻松的事？&quot;</li>
                  <li>&quot;我现在活力满满，根据我制定的计划的完成情况，我现在合适的任务有哪些？&quot;</li>
                  <li>&quot;我本年的读书计划完成得如何？&quot;</li>
                  <li>&quot;根据我的目标以及完成事项的记录，按照目标类型来分不同板块，生成本周周报&quot;</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
