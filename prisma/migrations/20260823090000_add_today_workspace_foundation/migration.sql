-- AlterTable
ALTER TABLE "Plan"
ADD COLUMN "due_date" DATE,
ADD COLUMN "estimated_minutes" INTEGER,
ADD COLUMN "energy_level" TEXT,
ADD CONSTRAINT "Plan_estimated_minutes_check" CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" > 0),
ADD CONSTRAINT "Plan_energy_level_check" CHECK ("energy_level" IS NULL OR "energy_level" IN ('low', 'medium', 'high'));

-- AlterTable
ALTER TABLE "ProgressRecord"
ADD COLUMN "schedule_block_id" TEXT,
ADD COLUMN "outcome" TEXT,
ADD COLUMN "counts_toward_recurrence" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" SERIAL NOT NULL,
    "gmt_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gmt_modified" TIMESTAMP(3) NOT NULL,
    "action_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "completed_at" TIMESTAMP(3),
    "due_date" DATE,
    "estimated_minutes" INTEGER,
    "energy_level" TEXT,
    "priority_quadrant" TEXT,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActionItem_estimated_minutes_check" CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" > 0),
    CONSTRAINT "ActionItem_energy_level_check" CHECK ("energy_level" IS NULL OR "energy_level" IN ('low', 'medium', 'high')),
    CONSTRAINT "ActionItem_priority_quadrant_check" CHECK ("priority_quadrant" IS NULL OR "priority_quadrant" IN ('q1', 'q2', 'q3', 'q4'))
);

-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" SERIAL NOT NULL,
    "gmt_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gmt_modified" TIMESTAMP(3) NOT NULL,
    "block_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "action_id" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "result_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleBlock_time_range_check" CHECK ("end_at" > "start_at"),
    CONSTRAINT "ScheduleBlock_status_check" CHECK ("status" IN ('scheduled', 'completed', 'partial', 'skipped', 'cancelled')),
    CONSTRAINT "ScheduleBlock_source_check" CHECK ("source" IN ('manual', 'ai_check', 'ai_chat'))
);

-- CreateTable
CREATE TABLE "PlanningPreference" (
    "id" SERIAL NOT NULL,
    "gmt_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gmt_modified" TIMESTAMP(3) NOT NULL,
    "preference_id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "day_start_minutes" INTEGER NOT NULL,
    "day_end_minutes" INTEGER NOT NULL,
    "high_energy_start_minutes" INTEGER,
    "high_energy_end_minutes" INTEGER,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 15,
    "default_block_minutes" INTEGER NOT NULL DEFAULT 60,
    "capacity_warning_minutes" INTEGER NOT NULL DEFAULT 480,

    CONSTRAINT "PlanningPreference_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlanningPreference_day_bounds_check" CHECK (0 <= "day_start_minutes" AND "day_start_minutes" < "day_end_minutes" AND "day_end_minutes" <= 1440),
    CONSTRAINT "PlanningPreference_high_energy_bounds_check" CHECK (
        ("high_energy_start_minutes" IS NULL AND "high_energy_end_minutes" IS NULL)
        OR (
            "high_energy_start_minutes" IS NOT NULL
            AND "high_energy_end_minutes" IS NOT NULL
            AND "day_start_minutes" <= "high_energy_start_minutes"
            AND "high_energy_start_minutes" < "high_energy_end_minutes"
            AND "high_energy_end_minutes" <= "day_end_minutes"
        )
    ),
    CONSTRAINT "PlanningPreference_buffer_minutes_check" CHECK ("buffer_minutes" >= 0),
    CONSTRAINT "PlanningPreference_default_block_minutes_check" CHECK ("default_block_minutes" > 0),
    CONSTRAINT "PlanningPreference_capacity_warning_minutes_check" CHECK ("capacity_warning_minutes" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "ActionItem_action_id_key" ON "ActionItem"("action_id");

-- CreateIndex
CREATE INDEX "ActionItem_plan_id_position_idx" ON "ActionItem"("plan_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleBlock_block_id_key" ON "ScheduleBlock"("block_id");

-- CreateIndex
CREATE INDEX "ScheduleBlock_start_at_end_at_idx" ON "ScheduleBlock"("start_at", "end_at");

-- CreateIndex
CREATE INDEX "ScheduleBlock_plan_id_start_at_idx" ON "ScheduleBlock"("plan_id", "start_at");

-- CreateIndex
CREATE INDEX "ScheduleBlock_action_id_status_idx" ON "ScheduleBlock"("action_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleBlock_one_scheduled_per_action_idx"
ON "ScheduleBlock"("action_id")
WHERE "action_id" IS NOT NULL AND "status" = 'scheduled';

-- CreateIndex
CREATE UNIQUE INDEX "PlanningPreference_preference_id_key" ON "PlanningPreference"("preference_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressRecord_schedule_block_id_key" ON "ProgressRecord"("schedule_block_id");

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("plan_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("plan_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "ActionItem"("action_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_schedule_block_id_fkey" FOREIGN KEY ("schedule_block_id") REFERENCES "ScheduleBlock"("block_id") ON DELETE SET NULL ON UPDATE CASCADE;
