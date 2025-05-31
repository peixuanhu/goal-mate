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
    const params = new URLSearchParams({ tag, pageNum: String(pageNum), pageSize: String(pageSize) })
    const res = await fetch(`/api/goal?${params}`)
    const data = await res.json()
    setGoals(data.list)
    setTotal(data.total)
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/tag').then(res => res.json()).then(setTagOptions)
  }, [])

  useEffect(() => { fetchGoals() }, [tag, pageNum])

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
    <div className="max-w-4xl mx-auto p-4 space-y-8">
      <div className="mb-4">
        <Button asChild variant="outline">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>目标管理</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="tag">标签</Label>
                <Input id="tag" className="w-full" placeholder="标签（可自定义）" value={form.tag || ''} onChange={e => setForm(f => ({ ...f, tag: e.target.value }))} required />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="name">名称</Label>
                <Input id="name" className="w-full" placeholder="名称" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="desc">描述</Label>
                <Textarea id="desc" className="w-full min-h-[40px]" placeholder="描述" value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading} className="w-28">{editingId ? '更新' : '新增'}</Button>
              {editingId && <Button type="button" variant="secondary" className="w-28" onClick={() => { setForm({}); setEditingId(null) }}>取消编辑</Button>}
            </div>
          </form>
          <div className="mb-4 mt-8">
            <Label className="mr-2">筛选标签</Label>
            <Select value={tag || 'all'} onValueChange={v => { setTag(v === 'all' ? '' : v); setPageNum(1) }}>
              <SelectTrigger className="w-40 inline-block">
                <SelectValue placeholder="全部标签" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部标签</SelectItem>
                {tagOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>标签</TableHead>
                <TableHead>描述</TableHead>
                <TableHead>操作</TableHead>
                <TableHead>跳转</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {goals.map(goal => (
                <TableRow key={goal.goal_id}>
                  <TableCell>{goal.name}</TableCell>
                  <TableCell>{goal.tag}</TableCell>
                  <TableCell>{goal.description}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(goal)} className="w-16">编辑</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(goal.goal_id)} className="w-16">删除</Button>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="secondary" onClick={() => router.push(`/plans?tag=${goal.tag}`)}>查看计划</Button>
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
