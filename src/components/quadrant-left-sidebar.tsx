"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ProgressRecord {
  gmt_create: string;
}

interface Plan {
  plan_id: string;
  name: string;
  description: string | null;
  progress: number;
  difficulty: string | null;
  tags: string[];
  priority_quadrant: string | null;
  is_scheduled: boolean;
  is_recurring: boolean;
  recurrence_type: string | null;
  recurrence_value: string | null;
  progressRecords?: ProgressRecord[];
}

enum RecurrenceType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

interface QuadrantData {
  q1: Plan[];
  q2: Plan[];
  q3: Plan[];
  q4: Plan[];
}

const QUADRANTS = [
  { 
    id: "q1", 
    title: "重要且紧急", 
    subtitle: "立即去做",
    color: "bg-red-50", 
    borderColor: "border-red-200",
    headerColor: "bg-red-500",
    countBg: "bg-red-100",
    countText: "text-red-600"
  },
  { 
    id: "q2", 
    title: "重要不紧急", 
    subtitle: "计划去做",
    color: "bg-blue-50", 
    borderColor: "border-blue-200",
    headerColor: "bg-blue-500",
    countBg: "bg-blue-100",
    countText: "text-blue-600"
  },
  { 
    id: "q3", 
    title: "不重要紧急", 
    subtitle: "授权去做",
    color: "bg-yellow-50", 
    borderColor: "border-yellow-200",
    headerColor: "bg-yellow-500",
    countBg: "bg-yellow-100",
    countText: "text-yellow-600"
  },
  { 
    id: "q4", 
    title: "不重要不紧急", 
    subtitle: "稍后去做",
    color: "bg-gray-50", 
    borderColor: "border-gray-200",
    headerColor: "bg-gray-500",
    countBg: "bg-gray-100",
    countText: "text-gray-600"
  },
];

interface TaskCardProps {
  plan: Plan;
  isOverlay?: boolean;
  onTaskClick?: (planId: string) => void;
  onRemove?: (planId: string) => void;
}

// 获取当前周期的开始时间
function getCurrentPeriodStart(recurrenceType: RecurrenceType): Date {
  const now = new Date();
  switch (recurrenceType) {
    case RecurrenceType.DAILY:
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case RecurrenceType.WEEKLY:
      const currentDay = now.getDay();
      const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
    case RecurrenceType.MONTHLY:
      return new Date(now.getFullYear(), now.getMonth(), 1);
    default:
      return new Date(0);
  }
}

// 获取当前周期的结束时间
function getCurrentPeriodEnd(recurrenceType: RecurrenceType): Date {
  const now = new Date();
  switch (recurrenceType) {
    case RecurrenceType.DAILY:
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, -1);
    case RecurrenceType.WEEKLY:
      const currentDay = now.getDay();
      const sundayOffset = currentDay === 0 ? 0 : 7 - currentDay;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + sundayOffset + 1, 0, 0, 0, -1);
    case RecurrenceType.MONTHLY:
      return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, -1);
    default:
      return new Date();
  }
}

// 获取目标次数
function getTargetCount(plan: Plan): number {
  if (!plan.is_recurring) return 1;
  if (plan.recurrence_value && plan.recurrence_value !== 'null') {
    return parseInt(plan.recurrence_value) || 1;
  }
  return 1;
}

// 获取当前周期内的进展记录次数
function getCurrentPeriodCount(plan: Plan): number {
  if (!plan.is_recurring || !plan.recurrence_type || !plan.progressRecords) {
    return 0;
  }
  const recurrenceType = plan.recurrence_type as RecurrenceType;
  const periodStart = getCurrentPeriodStart(recurrenceType);
  const periodEnd = getCurrentPeriodEnd(recurrenceType);
  return plan.progressRecords.filter(record => {
    const recordDate = new Date(record.gmt_create);
    return recordDate >= periodStart && recordDate <= periodEnd;
  }).length;
}

// 判断任务是否已完成（周期性任务按周期完成次数判断，普通任务按进度判断）
function isTaskCompleted(plan: Plan): boolean {
  if (plan.is_recurring && plan.recurrence_type) {
    const currentCount = getCurrentPeriodCount(plan);
    const targetCount = getTargetCount(plan);
    return currentCount >= targetCount;
  } else {
    return plan.progress >= 100;
  }
}

function TaskCard({ plan, isOverlay, onTaskClick, onRemove }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.plan_id, data: { plan } });
  const [isHovered, setIsHovered] = useState(false);
  const isCompleted = isTaskCompleted(plan);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = () => {
    // Prevent click when dragging
    if (isDragging) return;
    onTaskClick?.(plan.plan_id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        group cursor-pointer relative
        bg-white rounded-lg border border-gray-200 p-2.5 mb-2
        shadow-sm hover:shadow-md hover:border-blue-300 hover:bg-blue-50/30
        transition-all duration-200
        ${isOverlay ? "shadow-lg rotate-2 scale-105 z-50" : ""}
      `}
    >
      {onRemove && isHovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(plan.plan_id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 z-10 cursor-pointer text-sm leading-none shadow-sm"
          title="从四象限中移除"
        >
          ×
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-tight break-words ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {plan.name}
        </p>
        {plan.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {plan.tags.slice(0, 2).map((tag, idx) => (
              <span
                key={idx}
                className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface QuadrantColumnProps {
  quadrant: typeof QUADRANTS[number];
  plans: Plan[];
  onTaskClick?: (planId: string) => void;
  onRemoveTask?: (planId: string) => void;
}

function QuadrantColumn({ quadrant, plans, onTaskDrop, onTaskClick, onRemoveTask }: QuadrantColumnProps & { onTaskDrop: (planId: string, quadrantId: string) => void }) {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    
    try {
      const data = e.dataTransfer.getData('application/json');
      if (data) {
        const plan = JSON.parse(data);
        onTaskDrop(plan.plan_id, quadrant.id);
      }
    } catch (error) {
      console.error('Error parsing dropped data:', error);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        ${quadrant.color} ${quadrant.borderColor} border rounded-lg
        flex flex-col h-full overflow-hidden
        transition-colors duration-200
        ${isOver ? "ring-2 ring-blue-400 ring-offset-1 bg-opacity-80" : ""}
      `}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200/60">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">{quadrant.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{quadrant.subtitle}</p>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${quadrant.countBg} ${quadrant.countText}`}>
            {plans.length}
          </span>
        </div>
        <div className={`mt-2 h-0.5 rounded-full ${quadrant.headerColor}`} />
      </div>

      {/* Task List */}
      <div className="flex-1 p-2 overflow-y-auto min-h-[80px]">
        <SortableContext
          items={plans.map((p) => p.plan_id)}
          strategy={verticalListSortingStrategy}
        >
          {plans.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-400 py-4">
              暂无任务
            </div>
          ) : (
            plans.map((plan) => <TaskCard key={plan.plan_id} plan={plan} onTaskClick={onTaskClick} onRemove={onRemoveTask} />)
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export function QuadrantLeftSidebar() {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(true);
  const [quadrantData, setQuadrantData] = useState<QuadrantData>({
    q1: [],
    q2: [],
    q3: [],
    q4: [],
  });
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchQuadrantData = async () => {
    try {
      const res = await fetch("/api/plan/priority");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setQuadrantData({
        q1: data.q1 || [],
        q2: data.q2 || [],
        q3: data.q3 || [],
        q4: data.q4 || [],
      });
    } catch (error) {
      console.error("Error fetching quadrant data:", error);
    }
  };

  useEffect(() => {
    fetchQuadrantData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchQuadrantData, 30000);
    return () => clearInterval(interval);
  }, []);

  const updatePlanQuadrant = async (planId: string, targetQuadrant: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/plan/priority", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          priority_quadrant: targetQuadrant,
          is_scheduled: true,
        }),
      });

      if (res.ok) {
        await fetchQuadrantData();
      }
    } catch (error) {
      console.error("Error updating plan quadrant:", error);
    }
    setIsLoading(false);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const plan = active.data.current?.plan;
    if (plan) setActivePlan(plan);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActivePlan(null);

    if (!over) return;

    const planId = active.id as string;
    const overId = over.id as string;

    // Check if dropped on a quadrant
    if (QUADRANTS.some((q) => q.id === overId)) {
      await updatePlanQuadrant(planId, overId);
    }
  };

  const handleTaskClick = (planId: string) => {
    router.push(`/progress?plan_id=${planId}`);
  };

  const removeFromQuadrant = async (planId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/plan/priority", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          priority_quadrant: null,
          is_scheduled: false,
        }),
      });

      if (res.ok) {
        await fetchQuadrantData();
      }
    } catch (error) {
      console.error("Error removing plan from quadrant:", error);
    }
    setIsLoading(false);
  };

  if (!isExpanded) {
    return (
      <div className="w-10 bg-white border-r border-gray-200 flex flex-col items-center py-4 shadow-sm">
        <button
          onClick={() => setIsExpanded(true)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="展开四象限"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
        <div className="mt-4 flex flex-col gap-2">
          {QUADRANTS.map((q) => (
            <div
              key={q.id}
              className={`w-3 h-3 rounded-full ${q.headerColor}`}
              title={q.title}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-white border-r border-gray-200 flex flex-col shadow-sm relative">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <h2 className="font-semibold text-gray-800">我的任务</h2>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          title="收起"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Quadrant Grid */}
      <div className="flex-1 overflow-hidden p-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-2 gap-2 h-full">
            {QUADRANTS.map((quadrant) => (
              <QuadrantColumn
                key={quadrant.id}
                quadrant={quadrant}
                plans={quadrantData[quadrant.id as keyof QuadrantData]}
                onTaskDrop={updatePlanQuadrant}
                onTaskClick={handleTaskClick}
                onRemoveTask={removeFromQuadrant}
              />
            ))}
          </div>

          <DragOverlay>
            {activePlan ? <TaskCard plan={activePlan} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-50">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
