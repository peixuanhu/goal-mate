-- Idempotent database-only integrity overlay for Prisma db push deployments.
-- Formal source of truth: prisma/migrations/20260823090000_add_today_workspace_foundation/migration.sql

DO $$
BEGIN
    ALTER TABLE "Plan"
    ADD CONSTRAINT "Plan_estimated_minutes_check" CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" > 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
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
    ADD CONSTRAINT "ActionItem_estimated_minutes_check" CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" > 0);
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
