"use client"
import React, { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import Link from 'next/link'
import { Combobox } from "@/components/ui/combobox"
import { MainLayout } from "@/components/main-layout"
import { TextPreview } from "@/components/ui/text-preview"
import AuthGuard from "@/components/AuthGuard"
import { WysiwygEditor } from "@/components/ui/wysiwyg-editor"
import { GoalPlanList } from "@/components/goals/goal-plan-list"
import { ChevronDown, ChevronRight } from 'lucide-react'

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
  const [expandedGoalIds, setExpandedGoalIds] = useState<Set<string>>(() => new Set())

  const toggleGoalExpanded = (goalId: string) => {
    setExpandedGoalIds(current => {
      const next = new Set(current)
      if (next.has(goalId)) {
        next.delete(goalId)
      } else {
        next.add(goalId)
      }
      return next
    })
  }

  const fetchGoals = useCallback(async () => {
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
  }, [pageNum, pageSize, searchQuery, tag])

  useEffect(() => {
    fetch('/api/tag?pageSize=1000').then(res => res.json()).then(setTagOptions)
  }, [])

  useEffect(() => { fetchGoals() }, [fetchGoals])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
                <WysiwygEditor
                  id="desc"
                  label="描述"
                  value={form.description || ''}
                  onChange={(value: string) => setForm(f => ({ ...f, description: value }))}
                  placeholder="请输入目标的详细描述，可以包含链接、备注等信息..."
                  minHeight={150}
                />
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
              <div className="max-w-full rounded-lg border">
                <Table className="w-full table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[48px]"></TableHead>
                      <TableHead className="w-[30%]">名称</TableHead>
                      <TableHead className="w-[140px]">标签</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead className="w-[180px] min-w-[180px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {goals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
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
                      goals.map(goal => {
                        const expanded = expandedGoalIds.has(goal.goal_id)

                        return (
                          <React.Fragment key={goal.goal_id}>
                            <TableRow>
                              <TableCell className="w-[48px]">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  aria-label={expanded ? "收起关联计划" : "展开关联计划"}
                                  onClick={() => toggleGoalExpanded(goal.goal_id)}
                                >
                                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </Button>
                              </TableCell>
                              <TableCell className="min-w-0 font-medium">
                                <TextPreview
                                  text={goal.name}
                                  maxLength={50}
                                  className="font-medium"
                                  truncateLines={2}
                                />
                              </TableCell>
                              <TableCell className="w-[140px]">
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                  {goal.tag}
                                </span>
                              </TableCell>
                              <TableCell className="min-w-0 overflow-hidden">
                                <TextPreview
                                  text={goal.description || ''}
                                  maxLength={32}
                                  truncateLines={2}
                                />
                              </TableCell>
                              <TableCell className="w-[180px] min-w-[180px]">
                                <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap w-full">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEdit(goal)}
                                    className="h-8 min-w-[56px] px-2 text-xs"
                                    disabled={loading}
                                  >
                                    编辑
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleDelete(goal.goal_id)}
                                    className="h-8 min-w-[56px] px-2 text-xs"
                                    disabled={loading}
                                  >
                                    删除
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            {expanded ? (
                              <TableRow>
                                <TableCell colSpan={5} className="bg-gray-50 p-3 dark:bg-gray-900">
                                  <GoalPlanList goalId={goal.goal_id} />
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </React.Fragment>
                        )
                      })
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
