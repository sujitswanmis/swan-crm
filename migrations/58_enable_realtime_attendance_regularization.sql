-- Enable Supabase Realtime replication for attendance regularization, attendance records, and employee leaves
ALTER TABLE IF EXISTS public.attendance_regularization_requests REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.attendance_records REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.employee_leaves REPLICA IDENTITY FULL;

-- Allow CANCELLED status on employee_leaves so employees can cancel pending leaves
ALTER TABLE IF EXISTS public.employee_leaves DROP CONSTRAINT IF EXISTS employee_leaves_status_check;
ALTER TABLE IF EXISTS public.employee_leaves
  ADD CONSTRAINT employee_leaves_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'attendance_regularization_requests'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_regularization_requests;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'attendance_records'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'employee_leaves'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_leaves;
    END IF;
  END IF;
END $$;
