-- Idempotent database-only integrity overlay for Prisma db push deployments.
-- Formal source of truth: prisma/migrations/20260823090000_add_today_workspace_foundation/migration.sql
-- Extended by: prisma/migrations/20260825120000_add_plan_time_budget/migration.sql

WITH ranked_goals AS (
    SELECT
        "goal_id",
        ROW_NUMBER() OVER (
            ORDER BY
                "position" ASC NULLS LAST,
                "gmt_create" DESC,
                "goal_id" ASC
        ) - 1 AS normalized_position
    FROM "Goal"
)
UPDATE "Goal" AS goal
SET "position" = ranked_goals.normalized_position
FROM ranked_goals
WHERE goal."goal_id" = ranked_goals."goal_id"
    AND goal."position" IS DISTINCT FROM ranked_goals.normalized_position;

DO $$
DECLARE
    duplicate_plan_ids text;
    oversized_plan_ids text;
    oversized_action_ids text;
    oversized_preference_ids text;
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

    SELECT string_agg("plan_id", ', ' ORDER BY "plan_id")
    INTO oversized_plan_ids
    FROM "Plan"
    WHERE "estimated_minutes" > 2147483640;

    IF oversized_plan_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Plan.estimated_minutes exceeds maximum safe 15-minute rounding value 2147483640 for plans: %', oversized_plan_ids;
    END IF;

    SELECT string_agg("action_id", ', ' ORDER BY "action_id")
    INTO oversized_action_ids
    FROM "ActionItem"
    WHERE "estimated_minutes" > 2147483640;

    IF oversized_action_ids IS NOT NULL THEN
        RAISE EXCEPTION 'ActionItem.estimated_minutes exceeds maximum safe 15-minute rounding value 2147483640 for actions: %', oversized_action_ids;
    END IF;

    SELECT string_agg("preference_id", ', ' ORDER BY "preference_id")
    INTO oversized_preference_ids
    FROM "PlanningPreference"
    WHERE "default_block_minutes" > 2147483640;

    IF oversized_preference_ids IS NOT NULL THEN
        RAISE EXCEPTION 'PlanningPreference.default_block_minutes exceeds maximum safe 15-minute rounding value 2147483640 for preferences: %', oversized_preference_ids;
    END IF;
END
$$;

UPDATE "Plan"
SET
    "default_block_minutes" = ((("estimated_minutes"::bigint + 14) / 15) * 15)::integer,
    "estimated_minutes" = NULL
WHERE "is_recurring" = true AND "estimated_minutes" IS NOT NULL;

UPDATE "Plan"
SET "estimated_minutes" = ((("estimated_minutes"::bigint + 14) / 15) * 15)::integer
WHERE "is_recurring" = false
    AND "estimated_minutes" IS NOT NULL
    AND "estimated_minutes" % 15 <> 0;

UPDATE "Plan"
SET "estimated_minutes" = 60
WHERE "is_recurring" = false AND "estimated_minutes" IS NULL;

UPDATE "ActionItem"
SET "estimated_minutes" = ((("estimated_minutes"::bigint + 14) / 15) * 15)::integer
WHERE "estimated_minutes" IS NOT NULL
    AND "estimated_minutes" % 15 <> 0;

UPDATE "PlanningPreference"
SET "default_block_minutes" = ((("default_block_minutes"::bigint + 14) / 15) * 15)::integer
WHERE "default_block_minutes" % 15 <> 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_record
        JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
        JOIN pg_namespace namespace_record ON namespace_record.oid = table_record.relnamespace
        WHERE namespace_record.nspname = current_schema()
            AND table_record.relname = 'Plan'
            AND constraint_record.conname = 'Plan_estimated_minutes_check'
            AND constraint_record.contype = 'c'
            AND regexp_replace(
                lower(pg_get_constraintdef(constraint_record.oid)),
                '[^a-z0-9_%><=]+',
                '',
                'g'
            ) = 'checkestimated_minutesisnullorestimated_minutes>0andestimated_minutes%15=0'
    ) THEN
        ALTER TABLE "Plan" DROP CONSTRAINT IF EXISTS "Plan_estimated_minutes_check";
        ALTER TABLE "Plan"
        ADD CONSTRAINT "Plan_estimated_minutes_check"
        CHECK ("estimated_minutes" IS NULL OR ("estimated_minutes" > 0 AND "estimated_minutes" % 15 = 0));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_record
        JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
        JOIN pg_namespace namespace_record ON namespace_record.oid = table_record.relnamespace
        WHERE namespace_record.nspname = current_schema()
            AND table_record.relname = 'Plan'
            AND constraint_record.conname = 'Plan_default_block_minutes_check'
            AND constraint_record.contype = 'c'
            AND regexp_replace(
                lower(pg_get_constraintdef(constraint_record.oid)),
                '[^a-z0-9_%><=]+',
                '',
                'g'
            ) = 'checkdefault_block_minutesisnullordefault_block_minutes>0anddefault_block_minutes%15=0'
    ) THEN
        ALTER TABLE "Plan" DROP CONSTRAINT IF EXISTS "Plan_default_block_minutes_check";
        ALTER TABLE "Plan"
        ADD CONSTRAINT "Plan_default_block_minutes_check"
        CHECK ("default_block_minutes" IS NULL OR ("default_block_minutes" > 0 AND "default_block_minutes" % 15 = 0));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_record
        JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
        JOIN pg_namespace namespace_record ON namespace_record.oid = table_record.relnamespace
        WHERE namespace_record.nspname = current_schema()
            AND table_record.relname = 'ActionItem'
            AND constraint_record.conname = 'ActionItem_estimated_minutes_check'
            AND constraint_record.contype = 'c'
            AND regexp_replace(
                lower(pg_get_constraintdef(constraint_record.oid)),
                '[^a-z0-9_%><=]+',
                '',
                'g'
            ) = 'checkestimated_minutesisnullorestimated_minutes>0andestimated_minutes%15=0'
    ) THEN
        ALTER TABLE "ActionItem" DROP CONSTRAINT IF EXISTS "ActionItem_estimated_minutes_check";
        ALTER TABLE "ActionItem"
        ADD CONSTRAINT "ActionItem_estimated_minutes_check"
        CHECK ("estimated_minutes" IS NULL OR ("estimated_minutes" > 0 AND "estimated_minutes" % 15 = 0));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_record
        JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
        JOIN pg_namespace namespace_record ON namespace_record.oid = table_record.relnamespace
        WHERE namespace_record.nspname = current_schema()
            AND table_record.relname = 'PlanningPreference'
            AND constraint_record.conname = 'PlanningPreference_default_block_minutes_check'
            AND constraint_record.contype = 'c'
            AND regexp_replace(
                lower(pg_get_constraintdef(constraint_record.oid)),
                '[^a-z0-9_%><=]+',
                '',
                'g'
            ) = 'checkdefault_block_minutes>0anddefault_block_minutes%15=0'
    ) THEN
        ALTER TABLE "PlanningPreference" DROP CONSTRAINT IF EXISTS "PlanningPreference_default_block_minutes_check";
        ALTER TABLE "PlanningPreference"
        ADD CONSTRAINT "PlanningPreference_default_block_minutes_check"
        CHECK ("default_block_minutes" > 0 AND "default_block_minutes" % 15 = 0);
    END IF;
END
$$;

DO $$
BEGIN
    ALTER TABLE "Plan"
    ADD CONSTRAINT "Plan_energy_level_check" CHECK ("energy_level" IS NULL OR "energy_level" IN ('low', 'medium', 'high'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

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

CREATE OR REPLACE FUNCTION "enforce_schedule_block_slot_alignment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."start_at" <> date_trunc('minute', NEW."start_at")
        OR NEW."end_at" <> date_trunc('minute', NEW."end_at")
        OR mod(extract(epoch FROM (NEW."end_at" - NEW."start_at"))::bigint, 900) <> 0
    THEN
        RAISE EXCEPTION 'ScheduleBlock timestamps must align to 15-minute slots'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger trigger_record
        JOIN pg_class table_record ON table_record.oid = trigger_record.tgrelid
        JOIN pg_namespace namespace_record ON namespace_record.oid = table_record.relnamespace
        WHERE namespace_record.nspname = current_schema()
            AND table_record.relname = 'ScheduleBlock'
            AND trigger_record.tgname = 'ScheduleBlock_slot_alignment_trigger'
            AND NOT trigger_record.tgisinternal
    ) THEN
        CREATE TRIGGER "ScheduleBlock_slot_alignment_trigger"
        BEFORE INSERT OR UPDATE OF "start_at", "end_at"
        ON "ScheduleBlock"
        FOR EACH ROW
        EXECUTE FUNCTION "enforce_schedule_block_slot_alignment"();
    END IF;
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
