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
    <div className="max-w-5xl mx-auto p-4 space-y-8">
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="name">名称</Label>
                <Input id="name" className="w-full" placeholder="名称" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="desc">描述</Label>
                <Textarea id="desc" className="w-full min-h-[40px]" placeholder="描述" value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="difficulty">难度</Label>
                <Select value={form.difficulty ?? 'all'} onValueChange={v => setForm(f => ({ ...f, difficulty: v }))}>
                  <SelectTrigger id="difficulty" className="w-full">
                    <SelectValue placeholder="难度" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部难度</SelectItem>
                    {DIFFICULTY.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="progress">进度（0-1）</Label>
                <Input id="progress" type="number" min={0} max={1} step={0.01} className="w-full" value={form.progress} onChange={e => setForm(f => ({ ...f, progress: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              <Label>标签</Label>
              {tagOptions.map(t => (
                <label key={t} className="flex items-center gap-1">
                  <input type="checkbox" checked={form.tags?.includes(t)} onChange={e => {
                    setForm(f => ({ ...f, tags: e.target.checked ? [...(f.tags||[]), t] : (f.tags||[]).filter(x => x!==t) }))
                  }} /> {t}
                </label>
              ))}
              <Input
                className="w-32"
                placeholder="新标签"
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
            <div className="flex gap-2">
              <Button type="submit" disabled={loading} className="w-28">{editingId ? '更新' : '新增'}</Button>
              {editingId && <Button type="button" variant="secondary" className="w-28" onClick={() => { setForm({ tags: [], progress: '' }); setEditingId(null) }}>取消编辑</Button>}
            </div>
          </form>
          <div className="mb-4 mt-8 flex gap-4 items-center">
            <Label>筛选标签</Label>
            <Combobox
              options={tagOptions}
              value={tag === 'all' ? '' : tag}
              onChange={v => { setTag(v || 'all'); setPageNum(1) }}
              placeholder="全部标签"
              className="w-40 inline-block"
            />
            <Label>筛选难度</Label>
            <Select value={difficulty || 'all'} onValueChange={v => { setDifficulty(v === 'all' ? '' : v); setPageNum(1) }}>
              <SelectTrigger className="w-40 inline-block">
                <SelectValue placeholder="全部难度" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部难度</SelectItem>
                {DIFFICULTY.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Label>筛选目标</Label>
            <Combobox
              options={goals.map(g => g.name)}
              value={goals.find(g => g.goal_id === goalId)?.name || ''}
              onChange={v => {
                const g = goals.find(g => g.name === v)
                setGoalId(g ? g.goal_id : 'all'); setPageNum(1)
              }}
              placeholder="全部目标"
              className="w-40 inline-block"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>标签</TableHead>
                <TableHead>难度</TableHead>
                <TableHead>进度</TableHead>
                <TableHead>描述</TableHead>
                <TableHead>操作</TableHead>
                <TableHead>进展</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map(plan => (
                <TableRow key={plan.plan_id}>
                  <TableCell>{plan.name}</TableCell>
                  <TableCell>{plan.tags.join(', ')}</TableCell>
                  <TableCell>{plan.difficulty}</TableCell>
                  <TableCell>{typeof plan.progress === 'number' ? `${Math.round(plan.progress * 100)}%` : ''}</TableCell>
                  <TableCell>{plan.description}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(plan)} className="w-16">编辑</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(plan.plan_id)} className="w-16">删除</Button>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="secondary" onClick={() => router.push(`/progress?plan_id=${plan.plan_id}`)}>进展</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex gap-2 items-center mt-4">
            <Button variant="outline" disabled={pageNum === 1} onClick={() => setPageNum(p => p - 1)} className="w-20">上一页</Button>
            <span>第 {pageNum} 页 / 共 {Math.ceil(total / pageSize)} 页</span>
            <Button variant="outline" disabled={pageNum * pageSize >= total} onClick={() => setPageNum(p => p + 1)} className="w-20">下一页</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
