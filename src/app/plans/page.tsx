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

interface Plan {
  id: number
  plan_id: string
  name: string
  description: string
  difficulty: string
  progress: number
  tags: string[]
}
const DIFFICULTY = ['easy', 'medium', 'hard']

type PlanForm = {
  id?: number;
  plan_id?: string;
  name?: string;
  description?: string;
  difficulty?: string;
  progress: string;
  tags: string[];
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [tag, setTag] = useState('all')
  const [difficulty, setDifficulty] = useState('all')
  const [goalId, setGoalId] = useState('all')
  const [goals, setGoals] = useState<any[]>([])
  const [pageNum, setPageNum] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [form, setForm] = useState<PlanForm>({ tags: [], progress: '' })
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
    setForm({ tags: [], progress: '' })
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

  const handleSubmit = async (e: any) => {
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
    setForm({ tags: [], progress: '' })
    setEditingId(null)
    await fetchPlans()
    setLoading(false)
  }

  const handleEdit = (plan: Plan) => {
    setForm({
      ...plan,
      progress: plan.progress !== undefined && plan.progress !== null ? plan.progress.toString() : '',
      tags: plan.tags || []
    })
    setEditingId(plan.plan_id)
  }

  const handleDelete = async (plan_id: string) => {
    setLoading(true)
    await fetch(`/api/plan?plan_id=${plan_id}`, { method: 'DELETE' })
    await fetchPlans()
    setLoading(false)
  }

  // 生成实际请求参数
  const realTag = tag === 'all' ? '' : tag;
  const realDifficulty = difficulty === 'all' ? '' : difficulty;
  const realGoalId = goalId === 'all' ? '' : goalId;

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
                        onClick={() => { setForm({ tags: [], progress: '' }); setEditingId(null) }}
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
                    <TableHead className="min-w-[80px]">进度</TableHead>
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
                      <TableCell className="min-w-[80px]">
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
