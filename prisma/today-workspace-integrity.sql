-- Idempotent database-only integrity overlay for Prisma db push deployments.
-- Formal source of truth: prisma/migrations/20260823090000_add_today_workspace_foundation/migration.sql
-- Extended by: prisma/migrations/20260825120000_add_plan_time_budget/migration.sql

UPDATE "Plan"
SET
    "default_block_minutes" = (("estimated_minutes" + 14) / 15) * 15,
    "estimated_minutes" = NULL
WHERE "is_recurring" = true AND "estimated_minutes" IS NOT NULL;

UPDATE "Plan"
SET "estimated_minutes" = (("estimated_minutes" + 14) / 15) * 15
WHERE "is_recurring" = false AND "estimated_minutes" IS NOT NULL;

UPDATE "Plan"
SET "estimated_minutes" = 60
WHERE "is_recurring" = false AND "estimated_minutes" IS NULL;

UPDATE "ActionItem"
SET "estimated_minutes" = (("estimated_minutes" + 14) / 15) * 15
WHERE "estimated_minutes" IS NOT NULL;

DO $$
DECLARE duplicate_plan_ids text;
BEGIN
    SELECT string_agg("plan_id", ', ' ORDER BY "plan_id")
    INTO duplicate_plan_ids
    FROM (
        SELECT "plan_id"
        FROM "ScheduleBlock"
        WHERE "action_id" IS NULL AND "status" = 'scheduled'
        GROUP BY "plan_id"
        HAVING count(*) > 1
    ) duplicates;

    IF duplicate_plan_ids IS NOT NULL THEN
        RAISE EXCEPTION 'plans have multiple active direct schedule blocks: %', duplicate_plan_ids;
    END IF;
END
$$;

ALTER TABLE "Plan" DROP CONSTRAINT IF EXISTS "Plan_estimated_minutes_check";
ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_estimated_minutes_check"
CHECK ("estimated_minutes" IS NULL OR ("estimated_minutes" > 0 AND "estimated_minutes" % 15 = 0));

ALTER TABLE "Plan" DROP CONSTRAINT IF EXISTS "Plan_default_block_minutes_check";
ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_default_block_minutes_check"
CHECK ("default_block_minutes" IS NULL OR ("default_block_minutes" > 0 AND "default_block_minutes" % 15 = 0));

DO $$
BEGIN
    ALTER TABLE "Plan"
    ADD CONSTRAINT "Plan_energy_level_check" CHECK ("energy_level" IS NULL OR "energy_level" IN ('low', 'medium', 'high'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "ActionItem" DROP CONSTRAINT IF EXISTS "ActionItem_estimated_minutes_check";
ALTER TABLE "ActionItem"
ADD CONSTRAINT "ActionItem_estimated_minutes_check"
CHECK ("estimated_minutes" IS NULL OR ("estimated_minutes" > 0 AND "estimated_minutes" % 15 = 0));

DO $$
BEGIN
    ALTER TABLE "ActionItem"
    ADD CONSTRAINT "ActionItem_energy_level_check" CHECK ("energy_level" IS NULL OR "energy_level" IN ('low', 'medium', 'high'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "ActionItem"
    ADD CONSTRAINT "ActionItem_priority_quadrant_check" CHECK ("priority_quadrant" IS NULL OR "priority_quadrant" IN ('q1', 'q2', 'q3', 'q4'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "ScheduleBlock"
    ADD CONSTRAINT "ScheduleBlock_time_range_check" CHECK ("end_at" > "start_at");
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "ScheduleBlock"
    ADD CONSTRAINT "ScheduleBlock_status_check" CHECK ("status" IN ('scheduled', 'completed', 'partial', 'skipped', 'cancelled'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "ScheduleBlock"
    ADD CONSTRAINT "ScheduleBlock_source_check" CHECK ("source" IN ('manual', 'ai_check', 'ai_chat'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "PlanningPreference"
    ADD CONSTRAINT "PlanningPreference_day_bounds_check" CHECK (0 <= "day_start_minutes" AND "day_start_minutes" < "day_end_minutes" AND "day_end_minutes" <= 1440);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "PlanningPreference"
    ADD CONSTRAINT "PlanningPreference_high_energy_bounds_check" CHECK (
        ("high_energy_start_minutes" IS NULL AND "high_energy_end_minutes" IS NULL)
        OR (
            "high_energy_start_minutes" IS NOT NULL
            AND "high_energy_end_minutes" IS NOT NULL
            AND "day_start_minutes" <= "high_energy_start_minutes"
            AND "high_energy_start_minutes" < "high_energy_end_minutes"
            AND "high_energy_end_minutes" <= "day_end_minutes"
        )
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "PlanningPreference"
    ADD CONSTRAINT "PlanningPreference_buffer_minutes_check" CHECK ("buffer_minutes" >= 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "PlanningPreference"
    ADD CONSTRAINT "PlanningPreference_default_block_minutes_check" CHECK ("default_block_minutes" > 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "PlanningPreference"
    ADD CONSTRAINT "PlanningPreference_capacity_warning_minutes_check" CHECK ("capacity_warning_minutes" > 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleBlock_one_scheduled_per_action_idx"
ON "ScheduleBlock"("action_id")
WHERE "action_id" IS NOT NULL AND "status" = 'scheduled';

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleBlock_one_scheduled_direct_per_plan_idx"
ON "ScheduleBlock"("plan_id")
WHERE "action_id" IS NULL AND "status" = 'scheduled';
