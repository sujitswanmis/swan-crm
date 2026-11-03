-- Isolated profile-photo configuration. No existing operational tables or storage files are changed.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.profile_photo_policies (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_code text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'individual' CHECK (mode IN ('individual', 'shared')),
  inherit boolean NOT NULL DEFAULT false,
  avatar_url text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, branch_code),
  CHECK (branch_code = '' OR branch_code ~ '^TNT[0-9]{5,}-B[0-9]{4,}$'),
  CHECK (branch_code <> '' OR inherit = false)
);

CREATE TABLE IF NOT EXISTS public.scoped_profile_photos (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_code text NOT NULL DEFAULT '',
  user_id uuid NOT NULL,
  avatar_url text,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, branch_code, user_id),
  CHECK (branch_code = '' OR branch_code ~ '^TNT[0-9]{5,}-B[0-9]{4,}$')
);

ALTER TABLE public.profile_photo_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoped_profile_photos ENABLE ROW LEVEL SECURITY;
-- All access goes through session-verified Server Actions; browser clients have no direct access.
REVOKE ALL ON public.profile_photo_policies, public.scoped_profile_photos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profile_photo_policies, public.scoped_profile_photos TO service_role;

CREATE OR REPLACE FUNCTION public.set_profile_photo_policy(
  p_tenant_id uuid, p_branch_code text, p_mode text, p_inherit boolean,
  p_avatar_url text, p_change_avatar boolean, p_revision integer, p_actor uuid
) RETURNS integer LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE saved_revision integer;
BEGIN
  -- Serialize policy and personal-photo writes only within this secondary feature.
  PERFORM pg_advisory_xact_lock(hashtextextended('profile_photo:' || p_tenant_id::text, 0));
  IF p_revision = 0 THEN
    INSERT INTO public.profile_photo_policies (tenant_id, branch_code, mode, inherit, avatar_url, updated_by)
    VALUES (p_tenant_id, p_branch_code, p_mode, p_inherit, p_avatar_url, p_actor)
    ON CONFLICT (tenant_id, branch_code) DO NOTHING
    RETURNING revision INTO saved_revision;
  ELSE
    UPDATE public.profile_photo_policies SET mode = p_mode, inherit = p_inherit,
      avatar_url = CASE WHEN p_change_avatar THEN p_avatar_url ELSE avatar_url END,
      revision = revision + 1, updated_by = p_actor, updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = p_tenant_id AND branch_code = p_branch_code AND revision = p_revision
    RETURNING revision INTO saved_revision;
  END IF;
  IF saved_revision IS NULL THEN RAISE EXCEPTION 'photo_policy_changed'; END IF;
  RETURN saved_revision;
END $$;

CREATE OR REPLACE FUNCTION public.set_scoped_profile_photo(
  p_tenant_id uuid, p_branch_code text, p_user_id uuid, p_avatar_url text
) RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE selected_mode text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('profile_photo:' || p_tenant_id::text, 0));
  SELECT mode INTO selected_mode FROM public.profile_photo_policies
  WHERE tenant_id = p_tenant_id AND (branch_code = '' OR (branch_code = p_branch_code AND inherit = false))
  ORDER BY (branch_code <> '') DESC LIMIT 1;
  IF selected_mode = 'shared' THEN RAISE EXCEPTION 'photo_policy_locked'; END IF;
  INSERT INTO public.scoped_profile_photos (tenant_id, branch_code, user_id, avatar_url)
  VALUES (p_tenant_id, p_branch_code, p_user_id, p_avatar_url)
  ON CONFLICT (tenant_id, branch_code, user_id) DO UPDATE
  SET avatar_url = EXCLUDED.avatar_url, updated_at = CURRENT_TIMESTAMP;
END $$;

REVOKE ALL ON FUNCTION public.set_profile_photo_policy(uuid,text,text,boolean,text,boolean,integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_scoped_profile_photo(uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_photo_policy(uuid,text,text,boolean,text,boolean,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_scoped_profile_photo(uuid,text,uuid,text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
