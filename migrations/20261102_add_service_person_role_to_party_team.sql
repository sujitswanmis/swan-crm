-- Migration: Add 'Service Person' to party_team_assignments role_in_party check constraint
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'party_team_assignments_role_in_party_check'
  ) THEN
    ALTER TABLE public.party_team_assignments DROP CONSTRAINT party_team_assignments_role_in_party_check;
  END IF;

  -- Add updated check constraint with 'Service Person'
  ALTER TABLE public.party_team_assignments ADD CONSTRAINT party_team_assignments_role_in_party_check CHECK (
    role_in_party IN (
      'NSM', 'RSM', 'ASM', 'Sales Executive', 'Telecaller', 'Sales Coordinator', 'CRM', 'Service Person'
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Notice: Constraint update skipped or table absent: %', SQLERRM;
END $$;
