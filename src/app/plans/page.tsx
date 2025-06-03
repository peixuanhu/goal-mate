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
import { ChevronUp, ChevronDown, Filter, X } from 'lucide-react'

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

type SortConfig = {
  key: 'difficulty' | 'status' | null;
  direction: 'asc' | 'desc';
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [allPlans, setAllPlans] = useState<Plan[]>([])  // 存储所有计划用于本地排序
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState('all')
  const [selectedGoals, setSelectedGoals] = useState<string[]>([])
  const [taskTypeFilter, setTaskTypeFilter] = useState('all')  // 新增：任务类型筛选
  const [goals, setGoals] = useState<Array<{ goal_id: string; name: string; tag: string }>>([])
  const [pageNum, setPageNum] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [form, setForm] = useState<PlanForm>({ tags: [], progress: '', is_recurring: false })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' })
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tagOptions, setTagOptions] = useState<string[]>([])

  // 排序函数
  const sortPlans = (plans: Plan[], config: SortConfig): Plan[] => {
    if (!config.key) return plans;

    return [...plans].sort((a, b) => {
      if (config.key === 'difficulty') {
        const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
        const aVal = difficultyOrder[a.difficulty as keyof typeof difficultyOrder] || 0;
        const bVal = difficultyOrder[b.difficulty as keyof typeof difficultyOrder] || 0;
        return config.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      if (config.key === 'status') {
        // 获取具体的进度值（0-1）
        const getProgressValue = (plan: Plan) => {
          if (plan.is_recurring) {
            const details = getRecurringTaskDetails(plan);
            return details ? details.completionRate : 0;
          }
          return plan.progress || 0;
        };
        
        const aProgress = getProgressValue(a);
        const bProgress = getProgressValue(b);
        
        // 按进度值排序：升序是进度低的在前，降序是进度高的在前
        return config.direction === 'asc' ? aProgress - bProgress : bProgress - aProgress;
      }
      
      return 0;
    });
  };

  // 筛选函数
  const filterPlans = (plans: Plan[]): Plan[] => {
    return plans.filter(plan => {
      // 标签筛选（多选）
      const tagMatch = selectedTags.length === 0 || selectedTags.some(tag => plan.tags.includes(tag));
      
      // 难度筛选
      const difficultyMatch = difficulty === 'all' || plan.difficulty === difficulty;
      
      // 目标筛选（多选）- 这里需要根据实际的goal-plan关联逻辑调整
      const goalMatch = selectedGoals.length === 0 || selectedGoals.includes('all');
      
      // 任务类型筛选
      const taskTypeMatch = taskTypeFilter === 'all' || 
        (taskTypeFilter === 'recurring' && plan.is_recurring) ||
        (taskTypeFilter === 'normal' && !plan.is_recurring);
      
      return tagMatch && difficultyMatch && goalMatch && taskTypeMatch;
    });
  };

  const fetchPlans = async () => {
    setLoading(true)
    // 获取所有数据，在前端进行筛选和排序
    const params = new URLSearchParams({ pageSize: '1000' })
    const res = await fetch(`/api/plan?${params}`)
    const data = await res.json()
    
    setAllPlans(data.list || [])
    
    // 应用筛选和排序
    let filteredPlans = filterPlans(data.list || []);
    let sortedPlans = sortPlans(filteredPlans, sortConfig);
    
    // 应用分页
    const startIndex = (pageNum - 1) * pageSize;
    const paginatedPlans = sortedPlans.slice(startIndex, startIndex + pageSize);
    
    setPlans(paginatedPlans)
    setTotal(filteredPlans.length)
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
    if (urlTag && !selectedTags.includes(urlTag)) {
      setSelectedTags([urlTag]);
    }
  }, [searchParams, selectedTags]);

  // 当筛选条件或排序配置变化时重新筛选和排序
  useEffect(() => {
    if (allPlans.length > 0) {
      let filteredPlans = filterPlans(allPlans);
      let sortedPlans = sortPlans(filteredPlans, sortConfig);
      
      // 重置到第一页
      setPageNum(1);
      
      // 应用分页
      const startIndex = 0;
      const paginatedPlans = sortedPlans.slice(startIndex, startIndex + pageSize);
      
      setPlans(paginatedPlans);
      setTotal(filteredPlans.length);
    }
  }, [selectedTags, difficulty, selectedGoals, taskTypeFilter, sortConfig, allPlans, pageSize]);

  // 当页码变化时重新分页
  useEffect(() => {
    if (allPlans.length > 0) {
      let filteredPlans = filterPlans(allPlans);
      let sortedPlans = sortPlans(filteredPlans, sortConfig);
      
      // 应用分页
      const startIndex = (pageNum - 1) * pageSize;
      const paginatedPlans = sortedPlans.slice(startIndex, startIndex + pageSize);
      
      setPlans(paginatedPlans);
    }
  }, [pageNum]);

  useEffect(() => { 
    fetchPlans();
    fetchGoals();
  }, [])

  useEffect(() => {
    fetch('/api/tag?pageSize=1000').then(res => res.json()).then(setTagOptions)
  }, [])

  // 处理排序点击
  const handleSort = (key: 'difficulty' | 'status') => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // 渲染排序图标
  const renderSortIcon = (key: 'difficulty' | 'status') => {
    if (sortConfig.key !== key) {
      return <ChevronUp className="w-4 h-4 text-gray-300" />;
    }
    return sortConfig.direction === 'asc' ? 
      <ChevronUp className="w-4 h-4 text-blue-600" /> : 
      <ChevronDown className="w-4 h-4 text-blue-600" />;
  };

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

            {/* 增强的筛选器 */}
            <div className="mb-6 mt-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="w-4 h-4" />
                  <Label className="text-sm font-medium">筛选条件</Label>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* 标签筛选（多选） */}
                  <div className="space-y-2">
                    <Label>筛选标签（多选）</Label>
                    <div className="flex gap-2">
                      <div className="flex-1 flex flex-wrap gap-1 min-h-[32px] p-2 border rounded-md bg-white dark:bg-gray-700">
                        {selectedTags.length === 0 && (
                          <span className="text-gray-400 text-sm">全部标签</span>
                        )}
                        {selectedTags.map(tag => (
                          <span key={tag} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-1 rounded text-xs">
                            {tag}
                            <X 
                              className="w-3 h-3 cursor-pointer hover:text-red-500" 
                              onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
                            />
                          </span>
                        ))}
                      </div>
                      <Select 
                        value="" 
                        onValueChange={v => {
                          if (v === 'clear') {
                            setSelectedTags([]);
                          } else if (v && !selectedTags.includes(v)) {
                            setSelectedTags(prev => [...prev, v]);
                          }
                        }}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder="添加" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clear">清除所有</SelectItem>
                          {tagOptions.filter(tag => !selectedTags.includes(tag)).map(tag => (
                            <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* 难度筛选 */}
                  <div className="space-y-2">
                    <Label>筛选难度</Label>
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="全部难度" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部难度</SelectItem>
                        {DIFFICULTY.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 任务类型筛选 */}
                  <div className="space-y-2">
                    <Label>任务类型</Label>
                    <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="全部类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部类型</SelectItem>
                        <SelectItem value="normal">普通任务</SelectItem>
                        <SelectItem value="recurring">周期性任务</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 目标筛选（多选） */}
                  <div className="space-y-2">
                    <Label>筛选目标（多选）</Label>
                    <div className="flex gap-2">
                      <div className="flex-1 flex flex-wrap gap-1 min-h-[32px] p-2 border rounded-md bg-white dark:bg-gray-700">
                        {selectedGoals.length === 0 && (
                          <span className="text-gray-400 text-sm">全部目标</span>
                        )}
                        {selectedGoals.map(goalId => {
                          const goal = goals.find(g => g.goal_id === goalId);
                          return goal ? (
                            <span key={goalId} className="inline-flex items-center gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-1 rounded text-xs">
                              {goal.name}
                              <X 
                                className="w-3 h-3 cursor-pointer hover:text-red-500" 
                                onClick={() => setSelectedGoals(prev => prev.filter(id => id !== goalId))}
                              />
                            </span>
                          ) : null;
                        })}
                      </div>
                      <Select 
                        value="" 
                        onValueChange={v => {
                          if (v === 'clear') {
                            setSelectedGoals([]);
                          } else if (v && !selectedGoals.includes(v)) {
                            setSelectedGoals(prev => [...prev, v]);
                          }
                        }}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder="添加" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clear">清除所有</SelectItem>
                          {goals.filter(goal => !selectedGoals.includes(goal.goal_id)).map(goal => (
                            <SelectItem key={goal.goal_id} value={goal.goal_id}>{goal.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 带排序功能的表格 */}
            <div className="overflow-x-auto border rounded-lg">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">名称</TableHead>
                    <TableHead className="min-w-[100px]">标签</TableHead>
                    <TableHead className="min-w-[80px]">
                      <button 
                        className="flex items-center gap-1 hover:text-blue-600 cursor-pointer"
                        onClick={() => handleSort('difficulty')}
                      >
                        难度
                        {renderSortIcon('difficulty')}
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[100px]">
                      <button 
                        className="flex items-center gap-1 hover:text-blue-600 cursor-pointer"
                        onClick={() => handleSort('status')}
                      >
                        状态
                        {renderSortIcon('status')}
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[80px]">类型</TableHead>
                    <TableHead className="min-w-[200px]">描述</TableHead>
                    <TableHead className="min-w-[180px] sticky right-0 bg-white dark:bg-gray-950 border-l">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          加载中...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : plans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        <div className="space-y-2">
                          <div className="text-gray-500 dark:text-gray-400">暂无计划记录</div>
                          <div className="text-sm text-gray-400 dark:text-gray-500">开始创建您的第一个计划吧！</div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    plans.map(plan => (
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
                    ))
                  )}
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
