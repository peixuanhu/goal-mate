"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Combobox } from "@/components/ui/combobox"
import { MainLayout } from "@/components/main-layout"
import { TextPreview } from "@/components/ui/text-preview"
import AuthGuard from "@/components/AuthGuard"

interface Goal {
  id: number
  goal_id: string
  tag: string
  name: string
  description: string
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [tag, setTag] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [pageNum, setPageNum] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [form, setForm] = useState<Partial<Goal>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const router = useRouter();

  const fetchGoals = async () => {
    setLoading(true)
    const params = new URLSearchParams({ 
      tag, 
      pageNum: String(pageNum), 
      pageSize: String(pageSize),
      ...(searchQuery && { search: searchQuery })
    })
    const res = await fetch(`/api/goal?${params}`)
    const data = await res.json()
    setGoals(data.list)
    setTotal(data.total)
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/tag?pageSize=1000').then(res => res.json()).then(setTagOptions)
  }, [])

  useEffect(() => { fetchGoals() }, [tag, pageNum, searchQuery])

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setLoading(true)
    if (editingId) {
      await fetch('/api/goal', {
        method: 'PUT',
        body: JSON.stringify({ ...form, goal_id: editingId }),
        headers: { 'Content-Type': 'application/json' }
      })
    } else {
      await fetch('/api/goal', {
        method: 'POST',
        body: JSON.stringify(form),
        headers: { 'Content-Type': 'application/json' }
      })
    }
    setForm({})
    setEditingId(null)
    await fetchGoals()
    setLoading(false)
  }

  const handleEdit = (goal: Goal) => {
    setForm(goal)
    setEditingId(goal.goal_id)
  }

  const handleDelete = async (goal_id: string) => {
    setLoading(true)
    await fetch(`/api/goal?goal_id=${goal_id}`, { method: 'DELETE' })
    await fetchGoals()
    setLoading(false)
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 px-3 py-4 sm:space-y-8 sm:px-4 sm:py-6">
          <div className="mb-2 sm:mb-4">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/">返回首页</Link>
            </Button>
          </div>
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl">目标管理</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 px-4 sm:px-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 表单字段 - 响应式布局 */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tag">标签</Label>
                    <Combobox
                      options={tagOptions}
                      value={form.tag || ''}
                      onChange={v => setForm(f => ({ ...f, tag: v }))}
                      placeholder="标签（可自定义）"
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">名称</Label>
                    <Input 
                      id="name" 
                      className="w-full" 
                      placeholder="输入目标名称" 
                      value={form.name || ''} 
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                      required 
                    />
                  </div>
                  <div className="space-y-2 lg:col-span-1">
                    <Label>操作</Label>
                    <div className="flex flex-col gap-2 pt-0 sm:flex-row sm:pt-2">
                      <Button type="submit" disabled={loading} className="min-h-10 w-full flex-1 sm:min-w-[80px]">
                        {loading ? '保存中...' : (editingId ? '更新' : '新增')}
                      </Button>
                      {editingId && (
                        <Button 
                          type="button" 
                          variant="secondary" 
                          className="min-h-10 w-full flex-1 sm:min-w-[80px]" 
                          onClick={() => { setForm({}); setEditingId(null) }}
                        >
                          取消
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 描述字段 - 独立行，更大空间 */}
                <div className="space-y-2">
                  <Label htmlFor="desc">描述</Label>
                  <Textarea 
                    id="desc" 
                    className="w-full min-h-[100px] resize-y" 
                    placeholder="请输入目标的详细描述，可以包含链接、备注等信息..." 
                    value={form.description || ''} 
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} 
                  />
                </div>
              </form>

              {/* 筛选器 */}
              <div className="mb-6 mt-8 rounded-lg bg-gray-50 p-3 dark:bg-gray-800 sm:p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">搜索名称</Label>
                    <Input
                      placeholder="输入目标名称关键词..."
                      value={searchQuery}
                      onChange={e => {
                        setSearchQuery(e.target.value)
                        setPageNum(1) // 搜索时重置到第一页
                      }}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">筛选标签</Label>
                    <Select value={tag || 'all'} onValueChange={v => { setTag(v === 'all' ? '' : v); setPageNum(1) }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="全部标签" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部标签</SelectItem>
                        {tagOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* 表格 - 添加横向滚动 */}
              <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border">
                <Table className="min-w-[930px] w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[220px] min-w-[220px]">名称</TableHead>
                      <TableHead className="w-[140px] min-w-[140px]">标签</TableHead>
                      <TableHead className="w-[380px] min-w-[380px]">描述</TableHead>
                      <TableHead className="sticky right-0 z-[1] w-[190px] min-w-[190px] border-l bg-white shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] dark:bg-gray-950">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {goals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          {loading ? (
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                              加载中...
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-gray-500 dark:text-gray-400">暂无目标记录</div>
                              <div className="text-sm text-gray-400 dark:text-gray-500">开始创建您的第一个目标吧！</div>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      goals.map(goal => (
                        <TableRow key={goal.goal_id}>
                          <TableCell className="w-[220px] min-w-[220px] font-medium">
                            <TextPreview
                              text={goal.name}
                              maxLength={50}
                              className="font-medium"
                              truncateLines={2}
                            />
                          </TableCell>
                          <TableCell className="w-[140px] min-w-[140px]">
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              {goal.tag}
                            </span>
                          </TableCell>
                          <TableCell className="w-[380px] min-w-[380px]">
                            <TextPreview
                              text={goal.description || ''}
                              maxLength={100}
                              className="text-sm text-gray-600 dark:text-gray-400"
                              truncateLines={2}
                            />
                          </TableCell>
                          <TableCell className="sticky right-0 z-[1] w-[190px] min-w-[190px] border-l bg-white shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] dark:bg-gray-950">
                            <div className="flex flex-wrap gap-1 items-center justify-start">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleEdit(goal)} 
                                className="h-8 px-2 text-xs"
                                disabled={loading}
                              >
                                编辑
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                onClick={() => handleDelete(goal.goal_id)} 
                                className="h-8 px-2 text-xs"
                                disabled={loading}
                              >
                                删除
                              </Button>
                              <Button 
                                size="sm" 
                                variant="secondary" 
                                onClick={() => router.push(`/plans?tag=${goal.tag}`)}
                                className="h-8 px-2 text-xs"
                              >
                                计划
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* 分页 */}
              <div className="mt-6 flex flex-col gap-4 rounded-lg bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 dark:bg-gray-800">
                <div className="text-center text-sm text-gray-600 sm:text-left dark:text-gray-400">
                  共 {total} 条记录，第 {pageNum} 页 / 共 {Math.ceil(total / pageSize)} 页
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Button 
                    variant="outline" 
                    disabled={pageNum === 1} 
                    onClick={() => setPageNum(p => p - 1)} 
                    className="min-h-10 flex-1 sm:min-w-[80px] sm:flex-initial"
                  >
                    上一页
                  </Button>
                  <Button 
                    variant="outline" 
                    disabled={pageNum * pageSize >= total} 
                    onClick={() => setPageNum(p => p + 1)} 
                    className="min-h-10 flex-1 sm:min-w-[80px] sm:flex-initial"
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </AuthGuard>
  )
}
