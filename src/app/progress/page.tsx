"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Combobox } from "@/components/ui/combobox"
import { MainLayout } from "@/components/main-layout"

interface Plan {
  plan_id: string
  name: string
}
interface ProgressRecord {
  id: number
  plan_id: string
  plan_name?: string
  content: string
  thinking: string
  gmt_create: string
}

export default function ProgressPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [planId, setPlanId] = useState('all') // 默认显示所有计划
  const [records, setRecords] = useState<ProgressRecord[]>([])
  const [form, setForm] = useState<Partial<ProgressRecord>>({})
  const [editingId, setEditingId] = useState<number | null>(null) // 新增：编辑状态
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all') // 新增视图模式
  const searchParams = useSearchParams();

  const fetchPlans = async () => {
    const res = await fetch('/api/plan?pageSize=1000')
    const data = await res.json()
    setPlans(data.list || data)
  }
  
  const fetchAllRecords = async () => {
    setLoading(true)
    try {
      // 获取所有进展记录，按时间排序
      const res = await fetch('/api/progress_record?pageSize=100&orderBy=gmt_create&order=desc')
      const data = await res.json()
      
      // 为每条记录添加计划名称
      const recordsWithPlanNames = data.list.map((record: ProgressRecord) => {
        const plan = plans.find(p => p.plan_id === record.plan_id)
        return {
          ...record,
          plan_name: plan?.name || '未知计划'
        }
      })
      
      setRecords(recordsWithPlanNames)
    } catch (error) {
      console.error('获取进展记录失败:', error)
    }
    setLoading(false)
  }
  
  const fetchRecords = async (pid: string) => {
    if (!pid || pid === 'all') {
      await fetchAllRecords()
      return
    }
    setLoading(true)
    const res = await fetch(`/api/progress_record?plan_id=${pid}`)
    const data = await res.json()
    setRecords(data.list)
    setLoading(false)
  }
  
  useEffect(() => { fetchPlans() }, [])
  
  useEffect(() => {
    if (plans.length > 0) {
      fetchRecords(planId)
    }
  }, [planId, plans])
  
  useEffect(() => {
    const urlPlanId = searchParams.get('plan_id');
    if (urlPlanId && urlPlanId !== planId) {
      setPlanId(urlPlanId);
      setViewMode('single');
    }
  }, [searchParams]);

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (planId === 'all' && !editingId) {
      alert('请选择具体的计划来添加进展')
      return
    }
    
    setLoading(true)
    try {
      if (editingId) {
        // 更新记录
        await fetch('/api/progress_record', {
          method: 'PUT',
          body: JSON.stringify({ ...form, id: editingId }),
          headers: { 'Content-Type': 'application/json' }
        })
      } else {
        // 新增记录
        await fetch('/api/progress_record', {
          method: 'POST',
          body: JSON.stringify({ ...form, plan_id: planId }),
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      setForm({})
      setEditingId(null)
      await fetchRecords(planId)
    } catch (error) {
      console.error('保存进展记录失败:', error)
      alert('保存失败，请重试')
    }
    setLoading(false)
  }

  // 新增：编辑记录
  const handleEdit = (record: ProgressRecord) => {
    setForm(record)
    setEditingId(record.id)
    // 如果当前是查看所有模式，切换到单个计划模式
    if (planId === 'all') {
      setPlanId(record.plan_id)
      setViewMode('single')
    }
  }

  // 新增：取消编辑
  const handleCancelEdit = () => {
    setForm({})
    setEditingId(null)
  }

  // 新增：删除记录
  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条进展记录吗？')) {
      return
    }
    
    setLoading(true)
    try {
      await fetch(`/api/progress_record?id=${id}`, {
        method: 'DELETE'
      })
      await fetchRecords(planId)
    } catch (error) {
      console.error('删除进展记录失败:', error)
      alert('删除失败，请重试')
    }
    setLoading(false)
  }

  const handleViewModeChange = (mode: 'all' | 'single') => {
    setViewMode(mode)
    if (mode === 'all') {
      setPlanId('all')
      setEditingId(null) // 切换模式时取消编辑
      setForm({})
    } else if (plans.length > 0) {
      setPlanId(plans[0].plan_id)
    }
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto p-4 space-y-8">
        <div className="mb-4">
          <Button asChild variant="outline">
            <Link href="/">返回首页</Link>
          </Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              进展记录
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant={viewMode === 'all' ? 'default' : 'outline'}
                  onClick={() => handleViewModeChange('all')}
                >
                  查看所有进展
                </Button>
                <Button 
                  size="sm" 
                  variant={viewMode === 'single' ? 'default' : 'outline'}
                  onClick={() => handleViewModeChange('single')}
                >
                  单个计划管理
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-4 items-center">
              <Label>选择计划</Label>
              <Combobox
                options={[
                  ...(viewMode === 'all' ? ['查看所有计划'] : []),
                  ...plans.map(p => p.name)
                ]}
                value={
                  planId === 'all' 
                    ? '查看所有计划' 
                    : plans.find(p => p.plan_id === planId)?.name || ''
                }
                onChange={v => {
                  if (v === '查看所有计划') {
                    setPlanId('all')
                  } else {
                    const p = plans.find(p => p.name === v)
                    if (p) setPlanId(p.plan_id)
                  }
                }}
                placeholder="请选择计划"
                className="w-64"
              />
            </div>
            
            {/* 只在单个计划模式或编辑状态时显示表单 */}
            {(planId !== 'all' || editingId) && (
              <form onSubmit={handleSubmit} className="space-y-4 mb-8">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="content">进展内容</Label>
                    <Textarea 
                      id="content" 
                      className="w-full min-h-[40px]" 
                      placeholder="进展内容" 
                      value={form.content || ''} 
                      onChange={e => setForm(f => ({ ...f, content: e.target.value }))} 
                      required 
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="thinking">思考总结</Label>
                    <Textarea 
                      id="thinking" 
                      className="w-full min-h-[40px]" 
                      placeholder="思考总结" 
                      value={form.thinking || ''} 
                      onChange={e => setForm(f => ({ ...f, thinking: e.target.value }))} 
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={loading} className="w-32">
                    {editingId ? '更新进展' : '添加进展'}
                  </Button>
                  {editingId && (
                    <Button 
                      type="button" 
                      variant="secondary" 
                      onClick={handleCancelEdit}
                      className="w-24"
                    >
                      取消编辑
                    </Button>
                  )}
                </div>
              </form>
            )}
            
            <div className="mb-4">
              <h3 className="text-lg font-semibold">
                {planId === 'all' ? '所有计划的最新进展' : `${plans.find(p => p.plan_id === planId)?.name || ''} 的进展记录`}
              </h3>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  {planId === 'all' && <TableHead>计划名称</TableHead>}
                  <TableHead>内容</TableHead>
                  <TableHead>思考</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={planId === 'all' ? 5 : 4} className="text-center text-muted-foreground">
                      {loading ? '加载中...' : '暂无进展记录'}
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map(r => (
                    <TableRow key={r.id} className={editingId === r.id ? 'bg-blue-50 dark:bg-blue-950' : ''}>
                      <TableCell className="text-sm">{new Date(r.gmt_create).toLocaleString()}</TableCell>
                      {planId === 'all' && <TableCell className="font-medium">{r.plan_name}</TableCell>}
                      <TableCell className="max-w-xs truncate">{r.content}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.thinking}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleEdit(r)}
                            className="h-8 px-2 text-xs"
                            disabled={loading}
                          >
                            编辑
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive" 
                            onClick={() => handleDelete(r.id)}
                            className="h-8 px-2 text-xs"
                            disabled={loading}
                          >
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
