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
import { TextPreview } from "@/components/ui/text-preview"

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
  custom_time?: string
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
    // 将记录时间转换为datetime-local格式（本地时间）
    const recordTime = new Date(record.gmt_create)
    
    // 获取本地时间的各个部分
    const year = recordTime.getFullYear()
    const month = String(recordTime.getMonth() + 1).padStart(2, '0')
    const day = String(recordTime.getDate()).padStart(2, '0')
    const hours = String(recordTime.getHours()).padStart(2, '0')
    const minutes = String(recordTime.getMinutes()).padStart(2, '0')
    
    // 构造本地时间格式的字符串 YYYY-MM-DDTHH:mm
    const formattedTime = `${year}-${month}-${day}T${hours}:${minutes}`
    
    setForm({
      ...record,
      custom_time: formattedTime
    })
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
      <div className="max-w-7xl mx-auto p-4 space-y-8">
        <div className="mb-4">
          <Button asChild variant="outline">
            <Link href="/">返回首页</Link>
          </Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <span>进展记录</span>
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
            {/* 计划选择器 */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <Label className="text-sm font-medium">选择计划</Label>
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
                  className="w-full sm:w-80"
                />
              </div>
            </div>
            
            {/* 只在单个计划模式或编辑状态时显示表单 */}
            {(planId !== 'all' || editingId) && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {editingId ? '编辑进展记录' : '添加新进展'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* 进展内容 */}
                    <div className="space-y-2">
                      <Label htmlFor="content">进展内容</Label>
                      <Textarea 
                        id="content" 
                        className="w-full min-h-[120px] resize-y" 
                        placeholder="请详细描述今天的进展，包括完成的任务、遇到的问题、取得的成果等..." 
                        value={form.content || ''} 
                        onChange={e => setForm(f => ({ ...f, content: e.target.value }))} 
                        required 
                      />
                    </div>

                    {/* 记录时间（可选） */}
                    <div className="space-y-2">
                      <Label htmlFor="recordTime" className="flex items-center gap-2">
                        记录时间（可选）
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          留空则使用当前时间
                        </span>
                      </Label>
                      <Input
                        id="recordTime"
                        type="datetime-local"
                        className="w-full"
                        value={form.custom_time || ''}
                        onChange={e => setForm(f => ({ ...f, custom_time: e.target.value }))}
                        placeholder="选择记录时间"
                      />
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        💡 提示：此功能用于补登记之前漏掉的记录，如"昨天忘记记录的进展"
                      </div>
                    </div>

                    {/* 思考总结 */}
                    <div className="space-y-2">
                      <Label htmlFor="thinking">思考总结</Label>
                      <Textarea 
                        id="thinking" 
                        className="w-full min-h-[120px] resize-y" 
                        placeholder="请记录您的思考和反思，包括学到的知识点、改进的方向、下次的计划等..." 
                        value={form.thinking || ''} 
                        onChange={e => setForm(f => ({ ...f, thinking: e.target.value }))} 
                      />
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-3 pt-4">
                      <Button type="submit" disabled={loading} className="min-w-[120px]">
                        {loading ? '保存中...' : (editingId ? '更新进展' : '添加进展')}
                      </Button>
                      {editingId && (
                        <Button 
                          type="button" 
                          variant="secondary" 
                          onClick={handleCancelEdit}
                          className="min-w-[100px]"
                          disabled={loading}
                        >
                          取消编辑
                        </Button>
                      )}
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
            
            {/* 记录列表标题 */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold">
                {planId === 'all' ? '所有计划的最新进展' : `${plans.find(p => p.plan_id === planId)?.name || ''} 的进展记录`}
              </h3>
            </div>
            
            {/* 表格 - 添加横向滚动 */}
            <div className="overflow-x-auto border rounded-lg">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">时间</TableHead>
                    {planId === 'all' && <TableHead className="min-w-[120px]">计划名称</TableHead>}
                    <TableHead className="min-w-[250px]">内容</TableHead>
                    <TableHead className="min-w-[250px]">思考</TableHead>
                    <TableHead className="min-w-[130px] sticky right-0 bg-white dark:bg-gray-950 border-l">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={planId === 'all' ? 5 : 4} className="text-center text-muted-foreground py-8">
                        {loading ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            加载中...
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-gray-500 dark:text-gray-400">暂无进展记录</div>
                            {planId !== 'all' && (
                              <div className="text-sm text-gray-400 dark:text-gray-500">开始记录您的第一个进展吧！</div>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map(r => (
                      <TableRow key={r.id} className={editingId === r.id ? 'bg-blue-50 dark:bg-blue-950' : ''}>
                        <TableCell className="min-w-[140px] text-sm font-mono">
                          {new Date(r.gmt_create).toLocaleString()}
                        </TableCell>
                        {planId === 'all' && (
                          <TableCell className="min-w-[120px] font-medium">
                            <TextPreview
                              text={r.plan_name || ''}
                              maxLength={40}
                              className="font-medium"
                              truncateLines={1}
                            />
                          </TableCell>
                        )}
                        <TableCell className="min-w-[250px]">
                          <TextPreview
                            text={r.content}
                            maxLength={120}
                            className="text-sm"
                            truncateLines={3}
                          />
                        </TableCell>
                        <TableCell className="min-w-[250px]">
                          <TextPreview
                            text={r.thinking || ''}
                            maxLength={120}
                            className="text-sm text-gray-600 dark:text-gray-400"
                            truncateLines={3}
                          />
                        </TableCell>
                        <TableCell className="min-w-[130px] sticky right-0 bg-white dark:bg-gray-950 border-l">
                          <div className="flex gap-1 items-center justify-start whitespace-nowrap">
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
            </div>

            {/* 记录统计 */}
            {records.length > 0 && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  共 {records.length} 条进展记录
                  {planId !== 'all' && ` • ${plans.find(p => p.plan_id === planId)?.name || ''}`}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
