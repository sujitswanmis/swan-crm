-- ============================================================================
-- Sync public.field_task_seq with existing public.field_tasks.task_code values
-- Prevents duplicate key violations on field_tasks_task_code_key (23505)
-- Safe, additive & idempotent migration
-- ============================================================================

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.field_task_seq START 10001;

SELECT setval(
  'public.field_task_seq',
  GREATEST(
    10000,
    COALESCE(
      (
        SELECT MAX((regexp_match(task_code, '^TSK-(\d+)$'))[1]::BIGINT)
        FROM public.field_tasks
        WHERE task_code ~ '^TSK-\d+$'
      ),
      10000
    )
  ),
  true
);

COMMIT;
NOTIFY pgrst, 'reload schema';
