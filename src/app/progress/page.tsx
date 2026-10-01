"use client"
import React, { Suspense } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import Link from 'next/link'
import { Combobox } from "@/components/ui/combobox"
import { MainLayout } from "@/components/main-layout"
import { AppPage, PageHeader } from "@/components/app-page"
import { TextPreview } from "@/components/ui/text-preview"
import AuthGuard from "@/components/AuthGuard"
import { Slider } from '@/components/ui/slider'
import { ProgressMetricFields } from '@/components/journal/progress-metric-fields'
import { WriteError } from '@/components/journal/editor-shared'
import { useProgressJournal } from './use-progress-journal'
import { WysiwygEditor } from "@/components/ui/wysiwyg-editor"

export default function ProgressPage() {
  return (
    <Suspense fallback={<div role="status" className="p-6 text-sm text-muted-foreground">正在加载进展…</div>}>
      <ProgressPageContent />
    </Suspense>
  )
}

function ProgressPageContent() {
  const { plans, planId, setPlanId, records, form, setForm, editingId, loading, saving, viewMode,
    searchQuery, setSearchQuery, handleSubmit, handleEdit, handleCancelEdit, handleDelete, handleViewModeChange,
    trackers, timezone, today, metrics, onMetricsChange, outcome, onOutcomeChange, error, conflict, readError, reloadOriginal } = useProgressJournal()

  return (
    <AuthGuard>
      <MainLayout>
        <AppPage contentClassName="max-w-7xl space-y-6 sm:space-y-8">
          <PageHeader
            description="记录完成内容和思考，让每次推进都能回到对应计划。"
            eyebrow="Progress workspace"
            title="进展记录"
          />

          {readError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{readError}</p> : null}
          <Card className="min-w-0 overflow-hidden border-stone-200/80 shadow-sm">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="flex flex-col gap-3 text-lg sm:flex-row sm:items-center sm:justify-between sm:text-xl">
                <span>记录筛选与编辑</span>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button 
                    size="sm" 
                    variant={viewMode === 'all' ? 'default' : 'outline'}
                    onClick={() => handleViewModeChange('all')}
                    className="w-full sm:w-auto"
                  >
                    查看所有进展
                  </Button>
                  <Button 
                    size="sm" 
                    variant={viewMode === 'single' ? 'default' : 'outline'}
                    onClick={() => handleViewModeChange('single')}
                    className="w-full sm:w-auto"
                  >
                    单个计划管理
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 px-4 sm:px-6">
              {/* 计划选择器 */}
              <div className="mb-6 rounded-xl border border-stone-100 bg-stone-50 p-3 sm:p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
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
                      allowCustomOption={false}
                      emptyMessage="没有匹配的计划"
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">搜索内容</Label>
                    <Input
                      placeholder="搜索进展内容或思考..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
              
              {/* 只在单个计划模式或编辑状态时显示表单 */}
              {(planId !== 'all' || editingId) && (
                <Card className="mb-8 min-w-0 overflow-hidden">
                  <CardHeader className="px-4 sm:px-6">
                    <CardTitle className="text-base sm:text-lg">
                      {editingId ? '编辑进展记录' : '添加新进展'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 sm:px-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <fieldset disabled={loading} className="space-y-6">
                      {/* 如果是编辑状态，显示所属计划选择器 */}
                      {editingId && (
                        <div className="space-y-2">
                          <Label htmlFor="editPlan">所属计划</Label>
                          <Combobox
                            options={plans.map(p => p.name)}
                            value={
                              form.plan_id 
                                ? plans.find(p => p.plan_id === form.plan_id)?.name || ''
                                : plans.find(p => p.plan_id === planId)?.name || ''
                            }
                            onChange={v => {
                              const p = plans.find(p => p.name === v)
                              if (p) {
                                setForm(f => ({ ...f, plan_id: p.plan_id }))
                              }
                            }}
                            placeholder="请选择所属计划"
                            allowCustomOption={false}
                            emptyMessage="没有匹配的计划"
                            className="w-full"
                          />
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            💡 提示：你可以将此进展记录移动到其他计划
                          </div>
                        </div>
                      )}

                      {/* 进展内容 */}
                      <WysiwygEditor
                        id="content"
                        label="进展内容"
                        value={form.content || ''}
                        onChange={(value: string) => setForm(f => ({ ...f, content: value }))}
                        placeholder="请详细描述今天的进展，包括完成的任务、遇到的问题、取得的成果等..."
                        required
                        minHeight={180}
                      />

                      {/* 计划进度调整（仅限非周期性任务） */}
                      {(() => {
                        const currentPlan = editingId 
                          ? plans.find(p => p.plan_id === form.plan_id) 
                          : plans.find(p => p.plan_id === planId)
                        
                        if (currentPlan && !currentPlan.is_recurring) {
                          const currentProgress = form.progress_update !== undefined 
                            ? form.progress_update 
                            : (currentPlan.progress || 0)
                          
                          return (
                            <div className="space-y-2">
                              <Label>调整计划进度 ({Math.round(currentProgress * 100)}%)</Label>
                              <div className="space-y-3">
                                <Slider
                                  value={[currentProgress]}
                                  onValueChange={(value) => setForm(f => ({ ...f, progress_update: value[0] }))}
                                  max={1}
                                  min={0}
                                  step={0.01}
                                  className="w-full"
                                />
                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                  <span>0%</span>
                                  <span className="font-medium">{Math.round(currentProgress * 100)}%</span>
                                  <span>100%</span>
                                </div>
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                💡 提示：可选择更新计划的整体进度，仅适用于普通任务
                              </div>
                            </div>
                          )
                        }
                        return null
                      })()}

                      {/* 记录时间（可选） */}
                      <div className="space-y-2">
                        <Label htmlFor="recordTime" className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                            <span>记录时间（可选）</span>
                          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
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
                          💡 提示：此功能用于补登记之前漏掉的记录，如&quot;昨天忘记记录的进展&quot;
                        </div>
                      </div>

                      <p className="text-xs text-stone-500">发生时间按 {timezone} 解释。</p>
                      <ProgressMetricFields trackers={trackers} planId={editingId ? form.plan_id ?? planId : planId}
                        date={form.custom_time?.slice(0, 10) || today} value={metrics} onChange={onMetricsChange}
                        disabled={saving || !!form.custom_time && form.custom_time.slice(0, 10) > today} />
                      <div className="space-y-2">
                        <Label htmlFor="progressOutcome">完成状态</Label>
                        <select id="progressOutcome" className="min-h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm"
                          value={outcome} disabled={saving || !!form.schedule_block_id}
                          onChange={event => onOutcomeChange(event.target.value as typeof outcome)}>
                          <option value="legacy">保留原有计次规则</option>
                          <option value="data">仅记录数据，不计完成</option>
                          <option value="completed">已完成一次</option>
                          <option value="partial">部分完成</option>
                          <option value="skipped">跳过</option>
                        </select>
                        <p className="text-xs text-stone-500">填写结构化数据时，默认仅记录数据。安排的完成状态在今日工作台调整。</p>
                      </div>

                      {/* 思考总结 */}
                      <WysiwygEditor
                        id="thinking"
                        label="思考总结"
                        value={form.thinking || ''}
                        onChange={(value: string) => setForm(f => ({ ...f, thinking: value }))}
                        placeholder="请记录您的思考和反思，包括学到的知识点、改进的方向、下次的计划等..."
                        minHeight={180}
                      />

                      {/* 操作按钮 */}
                      <WriteError error={error} conflict={conflict} onReload={reloadOriginal} />
                      <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                        <Button type="submit" disabled={loading} className="min-h-10 w-full sm:min-w-[120px] sm:w-auto">
                          {loading ? '保存中...' : (editingId ? '更新进展' : '添加进展')}
                        </Button>
                        {editingId && (
                          <Button 
                            type="button" 
                            variant="secondary" 
                            onClick={handleCancelEdit}
                            className="min-h-10 w-full sm:min-w-[100px] sm:w-auto"
                            disabled={loading}
                          >
                            取消编辑
                          </Button>
                        )}
                      </div>
                      </fieldset>
                    </form>
                  </CardContent>
                </Card>
              )}
              
              {/* 记录列表标题 */}
              <div className="mb-4">
                <h3 className="break-words text-base font-semibold sm:text-lg">
                  {planId === 'all' ? '所有计划的最新进展' : `${plans.find(p => p.plan_id === planId)?.name || ''} 的进展记录`}
                </h3>
              </div>
              
              {/* 表格 */}
              <div className="max-w-full rounded-lg border">
                <Table className="w-full table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">时间</TableHead>
                      {planId === 'all' && <TableHead className="w-[128px]">计划名称</TableHead>}
                      <TableHead className="w-[24%]">内容</TableHead>
                      <TableHead className="w-[24%]">思考</TableHead>
                      <TableHead className="sticky right-0 z-[1] w-[116px] border-l bg-white shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] dark:bg-gray-950">操作</TableHead>
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
                          <TableCell className="w-[120px] text-sm font-mono">
                            {new Date(r.gmt_create).toLocaleString('zh-CN', { timeZone: timezone })}
                          </TableCell>
                          {planId === 'all' && (
                            <TableCell className="w-[128px] min-w-0 overflow-hidden font-medium">
                              <Link 
                                href={`/plans?highlight=${r.plan_id}`}
                                className="block min-w-0 max-w-full overflow-hidden text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer"
                              >
                                <TextPreview
                                  text={r.plan_name || ''}
                                  maxLength={28}
                                  className="max-w-full font-medium"
                                  truncateLines={1}
                                  forceClamp
                                />
                              </Link>
                            </TableCell>
                          )}
                          <TableCell className="min-w-0 overflow-hidden">
                            <TextPreview
                              text={r.content}
                              maxLength={88}
                              className="max-w-full"
                              truncateLines={3}
                              forceClamp
                            />
                          </TableCell>
                          <TableCell className="min-w-0 overflow-hidden">
                            <TextPreview
                              text={r.thinking || ''}
                              maxLength={88}
                              className="max-w-full"
                              truncateLines={3}
                              forceClamp
                            />
                          </TableCell>
                          <TableCell className="sticky right-0 z-[1] w-[116px] border-l bg-white shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] dark:bg-gray-950">
                            <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleEdit(r)}
                                className="h-8 min-w-[56px] px-2 text-xs"
                                disabled={loading}
                              >
                                编辑
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                onClick={() => handleDelete(r.id)}
                                className="h-8 min-w-[56px] px-2 text-xs"
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
                <div className="mt-4 rounded-xl border border-stone-100 bg-stone-50 p-3">
                  <div className="text-sm text-stone-600">
                    共 {records.length} 条进展记录
                    {planId !== 'all' && ` • ${plans.find(p => p.plan_id === planId)?.name || ''}`}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </AppPage>
      </MainLayout>
    </AuthGuard>
  )
}
