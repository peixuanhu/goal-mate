"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Combobox } from "@/components/ui/combobox"
import { MainLayout } from "@/components/main-layout"
import { TextPreview } from "@/components/ui/text-preview"
import { getRecurringTaskStatus, getRecurrenceTypeDisplay, getRecurringTaskDetails } from "@/lib/recurring-utils"

interface Plan {
  id: number
  plan_id: string
  name: string
  description: string
  difficulty: string
  progress: number
  is_recurring: boolean
  recurrence_type?: string
  recurrence_value?: string
  tags: string[]
  progressRecords: Array<{ gmt_create: Date }>
}
const DIFFICULTY = ['easy', 'medium', 'hard']

type PlanForm = {
  id?: number;
  plan_id?: string;
  name?: string;
  description?: string;
  difficulty?: string;
  progress: string;
  is_recurring: boolean;
  recurrence_type?: string;
  recurrence_value?: string;
  tags: string[];
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [tag, setTag] = useState('all')
  const [difficulty, setDifficulty] = useState('all')
  const [goalId, setGoalId] = useState('all')
  const [goals, setGoals] = useState<Array<{ goal_id: string; name: string; tag: string }>>([])
  const [pageNum, setPageNum] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [form, setForm] = useState<PlanForm>({ tags: [], progress: '', is_recurring: false })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tagOptions, setTagOptions] = useState<string[]>([])

  const fetchPlans = async () => {
    setLoading(true)
    const params = new URLSearchParams({ tag: tag === 'all' ? '' : tag, difficulty: difficulty === 'all' ? '' : difficulty, goal_id: goalId === 'all' ? '' : goalId, pageNum: String(pageNum), pageSize: String(pageSize) })
    const res = await fetch(`/api/plan?${params}`)
    const data = await res.json()
    setPlans(data.list)
    setTotal(data.total)
    setLoading(false)
    setForm({ tags: [], progress: '', is_recurring: false })
    setEditingId(null)
  }
  const fetchGoals = async () => {
    const res = await fetch('/api/goal?pageSize=1000')
    const data = await res.json()
    setGoals(data.list || data)
  }
  useEffect(() => {
    // 如果URL有tag参数，自动筛选
    const urlTag = searchParams.get('tag');
    if (urlTag && urlTag !== tag) setTag(urlTag);
  }, [searchParams]);

  // 修复：tag变化时自动刷新plan列表
  useEffect(() => {
    fetchPlans();
  }, [tag, difficulty, goalId, pageNum]);

  useEffect(() => { fetchGoals() }, [])

  useEffect(() => {
    fetch('/api/tag?pageSize=1000').then(res => res.json()).then(setTagOptions)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const submitData = {
      ...form,
      progress: form.progress === '' ? 0 : Number(form.progress)
    }
    if (editingId) {
      await fetch('/api/plan', {
        method: 'PUT',
        body: JSON.stringify({ ...submitData, plan_id: editingId }),
        headers: { 'Content-Type': 'application/json' }
      })
    } else {
      await fetch('/api/plan', {
        method: 'POST',
        body: JSON.stringify(submitData),
        headers: { 'Content-Type': 'application/json' }
      })
    }
    setForm({ tags: [], progress: '', is_recurring: false })
    setEditingId(null)
    await fetchPlans()
    setLoading(false)
  }

  const handleEdit = (plan: Plan) => {
    setForm({
      ...plan,
      progress: plan.progress !== undefined && plan.progress !== null ? plan.progress.toString() : '',
      tags: plan.tags || [],
      is_recurring: plan.is_recurring || false,
      recurrence_type: plan.recurrence_type,
      recurrence_value: plan.recurrence_value
    })
    setEditingId(plan.plan_id)
  }

  const handleDelete = async (plan_id: string) => {
    setLoading(true)
    await fetch(`/api/plan?plan_id=${plan_id}`, { method: 'DELETE' })
    await fetchPlans()
    setLoading(false)
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto p-4 space-y-8">
        <div className="mb-4">
          <Button asChild variant="outline">
            <Link href="/">返回首页</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>计划管理</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 表单字段 - 响应式布局 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">名称</Label>
                  <Input 
                    id="name" 
                    className="w-full" 
                    placeholder="输入计划名称" 
                    value={form.name || ''} 
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="difficulty">难度</Label>
                  <Select value={form.difficulty ?? 'all'} onValueChange={v => setForm(f => ({ ...f, difficulty: v }))}>
                    <SelectTrigger id="difficulty" className="w-full">
                      <SelectValue placeholder="选择难度" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部难度</SelectItem>
                      {DIFFICULTY.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="progress">进度（0-1）</Label>
                  <Input 
                    id="progress" 
                    type="number" 
                    min={0} 
                    max={1} 
                    step={0.01} 
                    className="w-full" 
                    placeholder="0.5"
                    value={form.progress} 
                    onChange={e => setForm(f => ({ ...f, progress: e.target.value }))} 
                    disabled={form.is_recurring}
                  />
                </div>
                <div className="space-y-2 lg:col-span-1 xl:col-span-1">
                  <Label>操作</Label>
                  <div className="flex gap-2 pt-2">
                    <Button type="submit" disabled={loading} className="flex-1 min-w-[80px]">
                      {editingId ? '更新' : '新增'}
                    </Button>
                    {editingId && (
                      <Button 
                        type="button" 
                        variant="secondary" 
                        className="flex-1 min-w-[80px]" 
                        onClick={() => { setForm({ tags: [], progress: '', is_recurring: false }); setEditingId(null) }}
                      >
                        取消
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* 周期性任务配置 */}
              <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="is_recurring"
                    className="rounded"
                    checked={form.is_recurring}
                    onChange={e => setForm(f => ({ 
                      ...f, 
                      is_recurring: e.target.checked,
                      progress: e.target.checked ? '0' : f.progress,
                      recurrence_type: e.target.checked ? 'daily' : undefined
                    }))}
                  />
                  <Label htmlFor="is_recurring" className="text-sm font-medium">这是一个周期性任务</Label>
                </div>
                
                {form.is_recurring && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="recurrence_type">周期类型</Label>
                      <Select 
                        value={form.recurrence_type || 'daily'} 
                        onValueChange={v => setForm(f => ({ ...f, recurrence_type: v }))}
                      >
                        <SelectTrigger id="recurrence_type" className="w-full">
                          <SelectValue placeholder="选择周期类型" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">每日</SelectItem>
                          <SelectItem value="weekly">每周</SelectItem>
                          <SelectItem value="monthly">每月</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recurrence_value">目标完成次数</Label>
                      <Input
                        id="recurrence_value"
                        type="number"
                        min={1}
                        max={50}
                        className="w-full"
                        placeholder="1"
                        value={form.recurrence_value || ''}
                        onChange={e => setForm(f => ({ ...f, recurrence_value: e.target.value }))}
                      />
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {(() => {
                          const type = form.recurrence_type || 'daily'
                          const typeText = type === 'daily' ? '每天' : type === 'weekly' ? '每周' : '每月'
                          return `${typeText}需要完成的次数（如：每周3次拳击）`
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {form.is_recurring && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <span className="font-medium">💡 周期性任务说明：</span>
                    <ul className="mt-1 ml-4 space-y-1 list-disc">
                      <li>通过记录进展来标记完成状态，无需设置进度百分比</li>
                      <li>系统会自动统计当前周期内的完成次数</li>
                      <li>达到目标次数后该周期会标记为"已完成"</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* 描述字段 - 独立行，更大空间 */}
              <div className="space-y-2">
                <Label htmlFor="desc">描述</Label>
                <Textarea 
                  id="desc" 
                  className="w-full min-h-[100px] resize-y" 
                  placeholder="请输入详细描述，可以包含链接、备注等信息..." 
                  value={form.description || ''} 
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} 
                />
              </div>

              {/* 标签字段 - 独立行 */}
              <div className="space-y-3">
                <Label>标签</Label>
                <div className="flex flex-wrap gap-3 items-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  {tagOptions.map(t => (
                    <label key={t} className="flex items-center gap-2 bg-white dark:bg-gray-700 px-3 py-2 rounded-md border hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded" 
                        checked={form.tags?.includes(t)} 
                        onChange={e => {
                          setForm(f => ({ ...f, tags: e.target.checked ? [...(f.tags||[]), t] : (f.tags||[]).filter(x => x!==t) }))
                        }} 
                      /> 
                      <span className="text-sm">{t}</span>
                    </label>
                  ))}
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-gray-600 dark:text-gray-400">新标签:</Label>
                    <Input
                      className="w-32"
                      placeholder="添加新标签"
                      value={form.tags?.find(tag => !tagOptions.includes(tag)) || ''}
                      onChange={e => {
                        const val = e.target.value.trim();
                        setForm(f => ({
                          ...f,
                          tags: [
                            ...(f.tags?.filter(tag => tagOptions.includes(tag)) || []),
                            ...(val ? [val] : [])
                          ]
                        }))
                      }}
                    />
                  </div>
                </div>
              </div>
            </form>

            {/* 筛选器 */}
            <div className="mb-6 mt-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label>筛选标签</Label>
                  <Combobox
                    options={tagOptions}
                    value={tag === 'all' ? '' : tag}
                    onChange={v => { setTag(v || 'all'); setPageNum(1) }}
                    placeholder="全部标签"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label>筛选难度</Label>
                  <Select value={difficulty || 'all'} onValueChange={v => { setDifficulty(v === 'all' ? '' : v); setPageNum(1) }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="全部难度" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部难度</SelectItem>
                      {DIFFICULTY.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>筛选目标</Label>
                  <Combobox
                    options={goals.map(g => g.name)}
                    value={goals.find(g => g.goal_id === goalId)?.name || ''}
                    onChange={v => {
                      const g = goals.find(g => g.name === v)
                      setGoalId(g ? g.goal_id : 'all'); setPageNum(1)
                    }}
                    placeholder="全部目标"
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* 表格 - 添加横向滚动 */}
            <div className="overflow-x-auto border rounded-lg">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">名称</TableHead>
                    <TableHead className="min-w-[100px]">标签</TableHead>
                    <TableHead className="min-w-[80px]">难度</TableHead>
                    <TableHead className="min-w-[100px]">状态</TableHead>
                    <TableHead className="min-w-[80px]">类型</TableHead>
                    <TableHead className="min-w-[200px]">描述</TableHead>
                    <TableHead className="min-w-[180px] sticky right-0 bg-white dark:bg-gray-950 border-l">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map(plan => (
                    <TableRow key={plan.plan_id}>
                      <TableCell className="min-w-[120px] font-medium">
                        <TextPreview
                          text={plan.name}
                          maxLength={50}
                          className="font-medium"
                          truncateLines={2}
                        />
                      </TableCell>
                      <TableCell className="min-w-[100px]">
                        <TextPreview
                          text={plan.tags.join(', ')}
                          maxLength={30}
                          truncateLines={1}
                        />
                      </TableCell>
                      <TableCell className="min-w-[80px]">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          plan.difficulty === 'easy' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          plan.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {plan.difficulty}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-[100px]">
                        {plan.is_recurring ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium">
                              {(() => {
                                const details = getRecurringTaskDetails(plan)
                                return details ? details.progressText : '0/1'
                              })()}
                            </span>
                            <div className="w-12 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 ${
                                  (() => {
                                    const details = getRecurringTaskDetails(plan)
                                    return details?.isCompleted ? 'bg-green-500' : 'bg-orange-500'
                                  })()
                                }`}
                                style={{ 
                                  width: `${(() => {
                                    const details = getRecurringTaskDetails(plan)
                                    return details ? Math.round(details.completionRate * 100) : 0
                                  })()}%` 
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {(() => {
                                const details = getRecurringTaskDetails(plan)
                                return details?.statusText || '未知状态'
                              })()}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 transition-all duration-300" 
                                style={{ width: `${typeof plan.progress === 'number' ? plan.progress * 100 : 0}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {typeof plan.progress === 'number' ? `${Math.round(plan.progress * 100)}%` : '0%'}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[80px]">
                        {plan.is_recurring ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                            {getRecurrenceTypeDisplay(plan.recurrence_type || '')}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            普通任务
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[200px]">
                        <TextPreview
                          text={plan.description || ''}
                          maxLength={100}
                          className="text-sm text-gray-600 dark:text-gray-400"
                          truncateLines={2}
                        />
                      </TableCell>
                      <TableCell className="min-w-[180px] sticky right-0 bg-white dark:bg-gray-950 border-l">
                        <div className="flex gap-1 items-center justify-start whitespace-nowrap">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(plan)} className="h-8 px-2 text-xs">
                            编辑
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(plan.plan_id)} className="h-8 px-2 text-xs">
                            删除
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => router.push(`/progress?plan_id=${plan.plan_id}`)} className="h-8 px-2 text-xs">
                            进展
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* 分页 */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                共 {total} 条记录，第 {pageNum} 页 / 共 {Math.ceil(total / pageSize)} 页
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  disabled={pageNum === 1} 
                  onClick={() => setPageNum(p => p - 1)} 
                  className="min-w-[80px]"
                >
                  上一页
                </Button>
                <Button 
                  variant="outline" 
                  disabled={pageNum * pageSize >= total} 
                  onClick={() => setPageNum(p => p + 1)} 
                  className="min-w-[80px]"
                >
                  下一页
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
