"use client";

import { useState, useEffect } from "react";
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

interface Plan {
  plan_id: string;
  name: string;
  description: string | null;
  progress: number;
  difficulty: string | null;
  tags: string[];
  priority_quadrant: string | null;
  is_scheduled: boolean;
}

interface TaskPoolProps {
  onTaskMoved?: () => void;
}

interface TaskCardProps {
  plan: Plan;
  isOverlay?: boolean;
}

function TaskCard({ plan, isOverlay }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.plan_id, data: { plan, type: "task" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        p-3 rounded-lg bg-white shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing
        hover:shadow-md transition-shadow
        ${isOverlay ? "shadow-lg rotate-2 scale-105" : ""}
      `}
    >
      <div className="font-medium text-sm text-gray-900 line-clamp-2">
        {plan.name}
      </div>
      {plan.description && (
        <div className="text-xs text-gray-500 mt-1 line-clamp-1">
          {plan.description}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2">
        {plan.difficulty && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {plan.difficulty}
          </span>
        )}
        <div className="flex-1">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full"
              style={{ width: `${plan.progress}%` }}
            />
          </div>
        </div>
        <span className="text-xs text-gray-500">{plan.progress}%</span>
      </div>
      {plan.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {plan.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600"
            >
              {tag}
            </span>
          ))}
          {plan.tags.length > 2 && (
            <span className="text-xs text-gray-400">+{plan.tags.length - 2}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskPool({ onTaskMoved }: TaskPoolProps) {
  const [tasks, setTasks] = useState<Plan[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchUnscheduledTasks = async () => {
    try {
      const response = await fetch("/api/plan?unscheduled=true&pageSize=100");
      if (response.ok) {
        const data = await response.json();
        setTasks(data.list || []);
      }
    } catch (error) {
      console.error("Error fetching unscheduled tasks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUnscheduledTasks();
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const plan = active.data.current?.plan as Plan;
    if (plan) {
      setActivePlan(plan);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActivePlan(null);

    if (!over) return;

    const planId = active.id as string;
    const overId = over.id as string;

    // 检查是否拖拽到象限（象限ID格式为 q1, q2, q3, q4）
    if (["q1", "q2", "q3", "q4"].includes(overId)) {
      await scheduleTask(planId, overId);
    }
  };

  const scheduleTask = async (planId: string, quadrant: string) => {
    try {
      const response = await fetch("/api/plan/priority", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          priority_quadrant: quadrant,
          is_scheduled: true,
        }),
      });

      if (response.ok) {
        // 从任务池中移除
        setTasks((prev) => prev.filter((t) => t.plan_id !== planId));
        onTaskMoved?.();
      }
    } catch (error) {
      console.error("Error scheduling task:", error);
    }
  };

  const filteredTasks = tasks.filter(
    (task) =>
      task.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-gray-900">任务池</h3>
        <p className="text-xs text-gray-500 mt-1">
          拖拽任务到右侧象限
        </p>
        <div className="mt-3">
          <input
            type="text"
            placeholder="搜索任务..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-y-auto p-3">
          <SortableContext
            items={filteredTasks.map((t) => t.plan_id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <TaskCard key={task.plan_id} plan={task} />
              ))}
              {filteredTasks.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-8">
                  {searchTerm ? "未找到匹配的任务" : "暂无未安排的任务"}
                </div>
              )}
            </div>
          </SortableContext>
        </div>

        <DragOverlay>
          {activePlan ? <TaskCard plan={activePlan} isOverlay /> : null}
        </DragOverlay>
      </DndContext>

      <div className="p-3 border-t bg-gray-50">
        <div className="text-xs text-gray-500 text-center">
          共 {tasks.length} 个未安排任务
        </div>
      </div>
    </div>
  );
}
