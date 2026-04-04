"use client"
import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { MainLayout } from "@/components/main-layout"
import { TextPreview } from "@/components/ui/text-preview"
import { getRecurrenceTypeDisplay, getRecurringTaskDetails } from "@/lib/recurring-utils"
import { ChevronUp, ChevronDown, Filter, X, GripVertical } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { refreshQuadrantSidebar } from "@/lib/utils"
import { MarkdownEditor } from "@/components/ui/markdown-editor"
import { MarkdownPreview } from "@/components/ui/markdown-preview"


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

// Draggable table row component using HTML5 drag and drop
function DraggableTableRow({ 
  plan, 
  highlightPlanId, 
  children,
}: { 
  plan: Plan; 
  highlightPlanId: string | null;
  children: React.ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    // Store plan data in dataTransfer for cross-component drag
    e.dataTransfer.setData('application/json', JSON.stringify(plan));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <TableRow 
      className={`
        ${highlightPlanId === plan.plan_id ? 'bg-yellow-100 dark:bg-yellow-900/20 animate-pulse' : ''}
        ${isDragging ? 'opacity-50' : ''}
      `}
    >
      <TableCell className="w-[40px] min-w-[40px] p-2" style={{ width: '40px' }}>
        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title="拖拽到四象限"
        >
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
      </TableCell>
      {children}
    </TableRow>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [allPlans, setAllPlans] = useState<Plan[]>([])  // 存储所有计划用于本地排序
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState('all')
  const [taskTypeFilter, setTaskTypeFilter] = useState('all')  // 新增：任务类型筛选
  const [progressFilter, setProgressFilter] = useState('incomplete')  // 新增：进度筛选，默认为未完成
  const [searchQuery, setSearchQuery] = useState('')
  const [pageNum, setPageNum] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [form, setForm] = useState<PlanForm>({ tags: [], progress: '', is_recurring: false })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' })
  const [highlightPlanId, setHighlightPlanId] = useState<string | null>(null)  // 新增：高亮计划ID
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState<string>('')  // 新增：独立管理新标签输入框的值

  // 判断计划是否已完成的函数
  const isPlanCompleted = (plan: Plan): boolean => {
    if (plan.is_recurring) {
      const details = getRecurringTaskDetails(plan);
      return details ? details.isCompleted : false;
    } else {
      return (plan.progress || 0) >= 1.0;
    }
  };

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
      // 名称搜索
      const nameMatch = !searchQuery || plan.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      // 标签筛选（多选）
      const tagMatch = selectedTags.length === 0 || selectedTags.some(tag => plan.tags.includes(tag));
      
      // 难度筛选
      const difficultyMatch = difficulty === 'all' || plan.difficulty === difficulty;
      
      // 任务类型筛选
      const taskTypeMatch = taskTypeFilter === 'all' || 
        (taskTypeFilter === 'recurring' && plan.is_recurring) ||
        (taskTypeFilter === 'normal' && !plan.is_recurring);
      
      // 进度筛选
      const progressMatch = progressFilter === 'all' || 
        (progressFilter === 'completed' && isPlanCompleted(plan)) ||
        (progressFilter === 'incomplete' && !isPlanCompleted(plan));
      
      return nameMatch && tagMatch && difficultyMatch && taskTypeMatch && progressMatch;
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

  useEffect(() => {
    // 如果URL有tag参数，自动筛选
    const urlTag = searchParams.get('tag');
    if (urlTag && !selectedTags.includes(urlTag)) {
      setSelectedTags([urlTag]);
    }
    
    // 如果URL有highlight参数，设置高亮计划
    const highlightId = searchParams.get('highlight');
    if (highlightId) {
      setHighlightPlanId(highlightId);
      // 5秒后取消高亮
      setTimeout(() => {
        setHighlightPlanId(null);
      }, 5000);
    }
  }, [searchParams, selectedTags]);

  // 当筛选条件或排序配置变化时重新筛选和排序
  useEffect(() => {
    if (allPlans.length > 0) {
      let filteredPlans = filterPlans(allPlans);
      let sortedPlans = sortPlans(filteredPlans, sortConfig);
      
      // 如果有高亮计划且不在筛选结果中，则添加到结果中
      if (highlightPlanId) {
        const highlightPlan = allPlans.find(plan => plan.plan_id === highlightPlanId);
        if (highlightPlan && !sortedPlans.find(plan => plan.plan_id === highlightPlanId)) {
          sortedPlans.unshift(highlightPlan); // 将高亮计划添加到列表最前面
        }
      }
      
      // 重置到第一页，但如果有高亮计划，找到包含该计划的页面
      let targetPageNum = 1;
      if (highlightPlanId) {
        const highlightIndex = sortedPlans.findIndex(plan => plan.plan_id === highlightPlanId);
        if (highlightIndex >= 0) {
          targetPageNum = Math.floor(highlightIndex / pageSize) + 1;
        }
      }
      setPageNum(targetPageNum);
      
      // 应用分页
      const startIndex = (targetPageNum - 1) * pageSize;
      const paginatedPlans = sortedPlans.slice(startIndex, startIndex + pageSize);
      
      setPlans(paginatedPlans);
      setTotal(filteredPlans.length + (highlightPlanId && !filteredPlans.find(plan => plan.plan_id === highlightPlanId) ? 1 : 0));
    }
  }, [selectedTags, difficulty, taskTypeFilter, progressFilter, searchQuery, sortConfig, allPlans, pageSize, highlightPlanId]);

  // 当页码变化时重新分页
  useEffect(() => {
    if (allPlans.length > 0) {
      let filteredPlans = filterPlans(allPlans);
      let sortedPlans = sortPlans(filteredPlans, sortConfig);
      
      // 如果有高亮计划且不在筛选结果中，则添加到结果中
      if (highlightPlanId) {
        const highlightPlan = allPlans.find(plan => plan.plan_id === highlightPlanId);
        if (highlightPlan && !sortedPlans.find(plan => plan.plan_id === highlightPlanId)) {
          sortedPlans.unshift(highlightPlan);
        }
      }
      
      // 应用分页
      const startIndex = (pageNum - 1) * pageSize;
      const paginatedPlans = sortedPlans.slice(startIndex, startIndex + pageSize);
      
      setPlans(paginatedPlans);
    }
  }, [pageNum, highlightPlanId, allPlans, sortConfig, selectedTags, difficulty, taskTypeFilter, progressFilter, searchQuery, pageSize]);

  useEffect(() => { 
    fetchPlans();
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
    // Refresh quadrant sidebar to reflect changes
    refreshQuadrantSidebar()
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
      <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 px-3 py-4 sm:space-y-8 sm:px-4 sm:py-6">
        <div className="mb-2 sm:mb-4">
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/">返回首页</Link>
          </Button>
        </div>
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-lg sm:text-xl">计划管理</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 px-4 sm:px-6">
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
                  <Label htmlFor="progress">进度 ({Math.round((parseFloat(form.progress) || 0) * 100)}%)</Label>
                  <div className="space-y-3">
                    <Slider
                      value={[parseFloat(form.progress) || 0]}
                      onValueChange={(value) => setForm(f => ({ ...f, progress: value[0].toString() }))}
                      max={1}
                      min={0}
                      step={0.01}
                      className="w-full"
                      disabled={form.is_recurring}
                    />
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>0%</span>
                      <span className="font-medium">{Math.round((parseFloat(form.progress) || 0) * 100)}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 lg:col-span-1 xl:col-span-1">
                  <Label>操作</Label>
                  <div className="flex flex-col gap-2 pt-0 sm:flex-row sm:pt-2">
                    <Button type="submit" disabled={loading} className="min-h-10 w-full flex-1 sm:min-w-[80px]">
                      {editingId ? '更新' : '新增'}
                    </Button>
                    {editingId && (
                      <Button 
                        type="button" 
                        variant="secondary" 
                        className="min-h-10 w-full flex-1 sm:min-w-[80px]" 
                        onClick={() => { setForm({ tags: [], progress: '', is_recurring: false }); setEditingId(null) }}
                      >
                        取消
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* 周期性任务配置 */}
              <div className="space-y-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-800 sm:p-4">
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
              <MarkdownEditor
                id="desc"
                label="描述"
                value={form.description || ''}
                onChange={(value) => setForm(f => ({ ...f, description: value }))}
                placeholder="请输入详细描述，可以包含链接、备注等信息...\n\n支持 Markdown 格式：\n- **粗体**、*斜体*、~~删除线~~\n- 标题、列表、任务列表\n- 代码块、引用、表格\n- 链接、图片"
                minHeight="150px"
              />

              {/* 标签字段 - 独立行 */}
              <div className="space-y-3">
                <Label>标签</Label>
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800 sm:p-4">
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
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <Label className="shrink-0 text-sm text-gray-600 dark:text-gray-400">新标签:</Label>
                    <Input
                      className="w-full min-w-0 sm:w-32"
                      placeholder="添加新标签"
                      value={newTagInput}
                      onChange={e => setNewTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = newTagInput.trim();
                          if (input) {
                            // 检查是否已存在（包括已有的和新添加的）
                            const existingTags = form.tags?.filter(tag => tagOptions.includes(tag)) || [];
                            const newTags = form.tags?.filter(tag => !tagOptions.includes(tag)) || [];
                            
                            // 只有当该标签不在已有选项中且不在新添加的标签中时才添加
                            if (!tagOptions.includes(input) && !newTags.includes(input)) {
                              setForm(f => ({
                                ...f,
                                tags: [...existingTags, ...newTags, input]
                              }));
                            }
                            // 清空输入框
                            setNewTagInput('');
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </form>

            {/* 增强的筛选器 */}
            <div className="mb-6 mt-8 rounded-lg bg-gray-50 p-3 dark:bg-gray-800 sm:p-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="w-4 h-4" />
                  <Label className="text-sm font-medium">筛选条件</Label>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {/* 搜索框 */}
                  <div className="space-y-2">
                    <Label>搜索名称</Label>
                    <Input
                      placeholder="输入计划名称关键词..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full"
                    />
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

                  {/* 进度筛选 */}
                  <div className="space-y-2">
                    <Label>筛选进度</Label>
                    <Select value={progressFilter} onValueChange={setProgressFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="全部进度" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部进度</SelectItem>
                        <SelectItem value="completed">已完成</SelectItem>
                        <SelectItem value="incomplete">未完成</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 标签筛选（多选） */}
                  <div className="space-y-2">
                    <Label>筛选标签（多选）</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="flex min-h-[32px] flex-1 flex-wrap gap-1 rounded-md border bg-white p-2 dark:bg-gray-700">
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
                        <SelectTrigger className="h-9 w-full shrink-0 sm:w-[120px]">
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
                </div>
              </div>
            </div>

            {/* 带排序功能的表格 */}
            <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border">
              <Table className="min-w-[1200px]" style={{ tableLayout: 'fixed', width: '1200px' }}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px] min-w-[40px] p-2" style={{ width: '40px' }}></TableHead>
                    <TableHead className="w-[220px] min-w-[220px]" style={{ width: '220px', maxWidth: '220px' }}>计划名称</TableHead>
                    <TableHead className="w-[100px] min-w-[100px]" style={{ width: '100px', maxWidth: '100px' }}>
                      <Button
                        variant="ghost"
                        className="h-auto p-0 font-semibold flex items-center gap-1 hover:bg-transparent"
                        onClick={() => handleSort('difficulty')}
                      >
                        难度
                        {renderSortIcon('difficulty')}
                      </Button>
                    </TableHead>
                    <TableHead className="w-[120px] min-w-[120px]" style={{ width: '120px', maxWidth: '120px' }}>
                      <Button
                        variant="ghost"
                        className="h-auto p-0 font-semibold flex items-center gap-1 hover:bg-transparent"
                        onClick={() => handleSort('status')}
                      >
                        进度
                        {renderSortIcon('status')}
                      </Button>
                    </TableHead>
                    <TableHead className="w-[100px] min-w-[100px]" style={{ width: '100px', maxWidth: '100px' }}>类型</TableHead>
                    <TableHead className="w-[350px] min-w-[350px]" style={{ width: '350px', maxWidth: '350px' }}>描述</TableHead>
                    <TableHead className="sticky right-0 z-[1] w-[170px] min-w-[170px] border-l bg-white shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] dark:bg-gray-950" style={{ width: '170px', maxWidth: '170px' }}>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          加载中...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : plans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        <div className="space-y-2">
                          <div className="text-gray-500 dark:text-gray-400">暂无计划记录</div>
                          <div className="text-sm text-gray-400 dark:text-gray-500">开始创建您的第一个计划吧！</div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    plans.map(plan => (
                      <DraggableTableRow 
                        key={plan.plan_id}
                        plan={plan}
                        highlightPlanId={highlightPlanId}
                      >
                        <TableCell className="w-[220px] min-w-[220px] font-medium" style={{ width: '220px', maxWidth: '220px', overflow: 'hidden' }}>
                          <TextPreview
                            text={plan.name}
                            maxLength={30}
                            className="font-medium"
                            truncateLines={1}
                          />
                        </TableCell>
                        <TableCell className="w-[100px] min-w-[100px]" style={{ width: '100px', maxWidth: '100px' }}>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            plan.difficulty === 'easy' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                            plan.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                            'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }`}>
                            {plan.difficulty}
                          </span>
                        </TableCell>
                        <TableCell className="w-[120px] min-w-[120px]" style={{ width: '120px', maxWidth: '120px' }}>
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
                        <TableCell className="w-[100px] min-w-[100px]" style={{ width: '100px', maxWidth: '100px' }}>
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
                        <TableCell className="w-[350px] min-w-[350px]" style={{ width: '350px', maxWidth: '350px', overflow: 'hidden' }}>
                          <MarkdownPreview
                            content={plan.description || ''}
                            maxLines={2}
                            showToggle={true}
                          />
                        </TableCell>
                        <TableCell className="sticky right-0 z-[1] w-[170px] min-w-[170px] border-l bg-white shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] dark:bg-gray-950" style={{ width: '170px', maxWidth: '170px' }}>
                          <div className="flex flex-wrap gap-1 items-center justify-start">
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
                      </DraggableTableRow>
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
  )
}
