-- ============================================================================
-- 6-digit zero-padded Field Task (TSK-000001) & Self Check-In (CHK-000001)
-- sequences. Keeps legacy unpadded TSK-10001+ rows intact (Zero Deletion).
-- Safe, additive & idempotent migration.
-- ============================================================================

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.field_task_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.field_checkin_seq START 1;

-- Non-destructive remap of legacy 5-digit TSK-10001..10999 rows -> 6-digit TSK-000001..000999
DO $$
DECLARE
  rec RECORD;
  new_code TEXT;
BEGIN
  FOR rec IN
    SELECT id, task_code, (regexp_match(task_code, '^TSK-(\d{5})$'))[1]::INT AS legacy_num
    FROM public.field_tasks
    WHERE task_code ~ '^TSK-10\d{3}$'
    ORDER BY created_at ASC
  LOOP
    new_code := 'TSK-' || LPAD((rec.legacy_num - 10000)::TEXT, 6, '0');
    IF NOT EXISTS (SELECT 1 FROM public.field_tasks WHERE task_code = new_code) THEN
      UPDATE public.field_tasks SET task_code = new_code WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- Sync field_task_seq strictly against 6+ digit padded TSK-000001 series
DO $$
DECLARE
  max_tsk BIGINT;
BEGIN
  SELECT MAX((regexp_match(task_code, '^TSK-(\d{6,})$'))[1]::BIGINT)
  INTO max_tsk
  FROM public.field_tasks
  WHERE task_code ~ '^TSK-\d{6,}$';

  IF max_tsk IS NULL OR max_tsk < 1 THEN
    PERFORM setval('public.field_task_seq', 1, false);
  ELSE
    PERFORM setval('public.field_task_seq', max_tsk, true);
  END IF;
END $$;

-- Sync field_checkin_seq strictly against 6+ digit padded CHK-000001 series
DO $$
DECLARE
  max_chk BIGINT;
BEGIN
  SELECT MAX((regexp_match(task_code, '^CHK-(\d{6,})$'))[1]::BIGINT)
  INTO max_chk
  FROM public.field_tasks
  WHERE task_code ~ '^CHK-\d{6,}$';

  IF max_chk IS NULL OR max_chk < 1 THEN
    PERFORM setval('public.field_checkin_seq', 1, false);
  ELSE
    PERFORM setval('public.field_checkin_seq', max_chk, true);
  END IF;
END $$;

ALTER TABLE public.field_tasks
  ALTER COLUMN task_code SET DEFAULT ('TSK-' || LPAD(nextval('public.field_task_seq')::TEXT, 6, '0'));

COMMIT;
NOTIFY pgrst, 'reload schema';
