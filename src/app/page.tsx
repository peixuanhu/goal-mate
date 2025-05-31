import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-muted">
      <h1 className="text-3xl font-bold mb-8">Goal Mate 首页</h1>
      <div className="flex flex-wrap gap-8">
        <Card className="w-64">
          <CardHeader>
            <CardTitle>目标管理</CardTitle>
          </CardHeader>
          <CardContent>
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
            <Button asChild className="w-full mt-2">
              <Link href="/progress">进入进展记录</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
