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
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
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

interface QuadrantData {
  q1: Plan[];
  q2: Plan[];
  q3: Plan[];
  q4: Plan[];
}

const QUADRANTS = [
  { id: "q1", title: "重要且紧急", color: "bg-red-100 border-red-300", headerColor: "bg-red-500" },
  { id: "q2", title: "重要不紧急", color: "bg-blue-100 border-blue-300", headerColor: "bg-blue-500" },
  { id: "q3", title: "不重要紧急", color: "bg-yellow-100 border-yellow-300", headerColor: "bg-yellow-500" },
  { id: "q4", title: "不重要不紧急", color: "bg-gray-100 border-gray-300", headerColor: "bg-gray-500" },
] as const;

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
  } = useSortable({ id: plan.plan_id, data: { plan } });

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
          {plan.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600"
            >
              {tag}
            </span>
          ))}
          {plan.tags.length > 3 && (
            <span className="text-xs text-gray-400">+{plan.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface QuadrantColumnProps {
  quadrant: typeof QUADRANTS[number];
  plans: Plan[];
}

function QuadrantColumn({ quadrant, plans }: QuadrantColumnProps) {
  const { setNodeRef, isOver } = useSortable({
    id: quadrant.id,
    data: { type: "quadrant", id: quadrant.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col rounded-xl border-2 overflow-hidden
        ${quadrant.color}
        ${isOver ? "ring-2 ring-offset-2 ring-blue-400" : ""}
        h-full min-h-[200px]
      `}
    >
      <div className={`${quadrant.headerColor} text-white px-4 py-2 font-semibold text-sm`}>
        {quadrant.title}
        <span className="ml-2 text-xs opacity-80">({plans.length})</span>
      </div>
      <div className="flex-1 p-3 space-y-2 overflow-y-auto">
        <SortableContext
          items={plans.map((p) => p.plan_id)}
          strategy={verticalListSortingStrategy}
        >
          {plans.map((plan) => (
            <TaskCard key={plan.plan_id} plan={plan} />
          ))}
        </SortableContext>
        {plans.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-8">
            拖拽任务到此处
          </div>
        )}
      </div>
    </div>
  );
}

export function QuadrantSidebar() {
  const [quadrantData, setQuadrantData] = useState<QuadrantData>({
    q1: [],
    q2: [],
    q3: [],
    q4: [],
  });
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const fetchQuadrantData = async () => {
    try {
      const response = await fetch("/api/plan/priority");
      if (response.ok) {
        const data = await response.json();
        setQuadrantData(data);
      }
    } catch (error) {
      console.error("Error fetching quadrant data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuadrantData();
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

    // 检查是否拖拽到象限
    const targetQuadrant = QUADRANTS.find((q) => q.id === overId);
    if (targetQuadrant) {
      // 拖拽到象限
      await updatePlanQuadrant(planId, targetQuadrant.id);
    }
  };

  const updatePlanQuadrant = async (planId: string, quadrant: string) => {
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
        await fetchQuadrantData();
      }
    } catch (error) {
      console.error("Error updating plan quadrant:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">任务四象限</h2>
        <p className="text-sm text-gray-500">拖拽任务调整优先级</p>
      </div>
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[calc(100%-80px)]">
          {QUADRANTS.map((quadrant) => (
            <QuadrantColumn
              key={quadrant.id}
              quadrant={quadrant}
              plans={quadrantData[quadrant.id as keyof QuadrantData]}

            />
          ))}
        </div>

        <DragOverlay>
          {activePlan ? <TaskCard plan={activePlan} isOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
