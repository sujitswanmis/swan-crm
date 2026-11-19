-- SaaS-only additive migration. Review/apply separately; no existing data is removed.
BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.saas_invoice_number_seq;

CREATE TABLE IF NOT EXISTS public.saas_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  operation text NOT NULL,
  request_payload jsonb NOT NULL,
  invoice_number text NOT NULL UNIQUE,
  invoice jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_id)
);
CREATE INDEX IF NOT EXISTS saas_billing_events_tenant_created ON public.saas_billing_events (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS saas_paid_payment_reference ON public.saas_billing_events (tenant_id, lower(btrim(invoice->>'transaction_id')))
  WHERE invoice->>'status' = 'PAID' AND length(btrim(coalesce(invoice->>'transaction_id',''))) > 0;
ALTER TABLE public.saas_billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_billing_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.saas_billing_events TO service_role;
GRANT USAGE, SELECT ON public.saas_invoice_number_seq TO service_role;

CREATE TABLE IF NOT EXISTS public.saas_workspace_operations (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  request_payload jsonb NOT NULL,
  admin_user_id uuid,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETE')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saas_workspace_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_workspace_operations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.saas_workspace_operations TO service_role;

CREATE OR REPLACE FUNCTION public.saas_user_in_workspace(p_user public.user_roles, p_tenant public.tenants)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_user.tenant_id IS NOT NULL THEN p_user.tenant_id = p_tenant.id ELSE
    NOT EXISTS (SELECT 1 FROM public.tenants other_tenant WHERE other_tenant.id <> p_tenant.id
      AND lower(p_user.company) IN (lower(other_tenant.name),lower(other_tenant.tenant_code)))
    AND (lower(p_user.company) IN (lower(p_tenant.name),lower(p_tenant.tenant_code))
      OR (p_tenant.id = '00000000-0000-0000-0000-000000000001' AND lower(p_user.company) IN
        ('nsmlr','nstlp','nstl','new swan group','swan agro','nse-1','nse-2','nse-6','nscpl','nsacpl')))
  END
$$;

CREATE OR REPLACE FUNCTION public.saas_prepare_workspace(p_actor_id uuid, p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  op public.saas_workspace_operations%ROWTYPE;
  t public.tenants%ROWTYPE;
  next_code text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('saas-workspace-provisioning'));
  SELECT * INTO op FROM public.saas_workspace_operations WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF op.actor_id <> p_actor_id OR op.request_payload <> p_payload THEN RAISE EXCEPTION 'Provisioning request changed. Start a new request.'; END IF;
    SELECT * INTO STRICT t FROM public.tenants WHERE id = op.tenant_id;
    RETURN jsonb_build_object('tenant', to_jsonb(t), 'complete', op.status = 'COMPLETE', 'admin_user_id', op.admin_user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE lower(primary_contact_email) = lower(p_payload->>'email'))
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE lower(email) = lower(p_payload->>'email') OR lower(emp_official_mail_id) = lower(p_payload->>'email')) THEN
    RAISE EXCEPTION 'This email already belongs to an existing account/workspace. No account was changed.';
  END IF;
  SELECT 'TNT' || lpad((greatest(3, coalesce(max(substring(tenant_code FROM '^TNT([0-9]+)$')::bigint), 3)) + 1)::text, 5, '0')
    INTO next_code FROM public.tenants WHERE tenant_code ~ '^TNT[0-9]+$';
  INSERT INTO public.tenants (tenant_code, name, primary_contact_email, primary_contact_mobile, status)
    VALUES (next_code, p_payload->>'company', p_payload->>'email', nullif(p_payload->>'mobile', ''), 'DRAFT') RETURNING * INTO t;
  INSERT INTO public.saas_workspace_operations (request_id, actor_id, tenant_id, request_payload)
    VALUES (p_request_id, p_actor_id, t.id, p_payload);
  RETURN jsonb_build_object('tenant', to_jsonb(t), 'complete', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_finalize_workspace(p_actor_id uuid, p_request_id uuid, p_admin_user_id uuid, p_subscription jsonb, p_entitlements jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  op public.saas_workspace_operations%ROWTYPE;
  t public.tenants%ROWTYPE;
  entry jsonb;
BEGIN
  SELECT * INTO STRICT op FROM public.saas_workspace_operations WHERE request_id = p_request_id FOR UPDATE;
  IF op.actor_id <> p_actor_id THEN RAISE EXCEPTION 'Provisioning actor mismatch.'; END IF;
  SELECT * INTO STRICT t FROM public.tenants WHERE id = op.tenant_id FOR UPDATE;
  IF op.status = 'COMPLETE' THEN RETURN jsonb_build_object('tenant', to_jsonb(t), 'complete', true); END IF;
  IF op.admin_user_id IS NOT NULL AND op.admin_user_id <> p_admin_user_id THEN RAISE EXCEPTION 'Provisioning administrator mismatch.'; END IF;
  -- Some installations create an unbound default role in an auth trigger. Only
  -- that new, non-privileged role may be completed by this service-only RPC.
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_admin_user_id AND (
    (tenant_id IS NOT NULL AND tenant_id <> t.id)
    OR (coalesce(company, '') <> '' AND lower(company) <> lower(t.name))
    OR lower(coalesce(role,'')) IN ('admin','tenant_admin','superadmin','super_admin','masteradmin','master_admin')
    OR coalesce(module_access->>'is_master_admin','false') = 'true'
  )) THEN
    RAISE EXCEPTION 'Existing user accounts cannot be reassigned by workspace provisioning.';
  END IF;
  INSERT INTO public.user_roles (user_id, tenant_id, role, is_approved, can_read, can_write, emp_id, emp_name,
    emp_official_mail_id, emp_mobile, emp_designation, emp_department, company, emp_status)
    VALUES (p_admin_user_id, t.id, 'admin', true, true, true, t.tenant_code || '-ADM001', op.request_payload->>'admin_name',
      op.request_payload->>'email', op.request_payload->>'mobile', 'Chief Administrator', 'Administration', t.name, 'Active')
    ON CONFLICT (user_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,role=EXCLUDED.role,is_approved=EXCLUDED.is_approved,
      can_read=EXCLUDED.can_read,can_write=EXCLUDED.can_write,emp_id=EXCLUDED.emp_id,emp_name=EXCLUDED.emp_name,
      emp_official_mail_id=EXCLUDED.emp_official_mail_id,emp_mobile=EXCLUDED.emp_mobile,emp_designation=EXCLUDED.emp_designation,
      emp_department=EXCLUDED.emp_department,company=EXCLUDED.company,emp_status=EXCLUDED.emp_status;
  INSERT INTO public.tenant_subscriptions (tenant_id, plan_name, user_seat_limit, valid_from, valid_until, status, billing_cycle, amount)
    VALUES (t.id, p_subscription->>'plan_name', (p_subscription->>'user_seat_limit')::integer,
      (p_subscription->>'valid_from')::timestamptz, (p_subscription->>'valid_until')::timestamptz,
      p_subscription->>'status', p_subscription->>'billing_cycle', (p_subscription->>'amount')::numeric);
  FOR entry IN SELECT value FROM jsonb_array_elements(p_entitlements) LOOP
    INSERT INTO public.tenant_entitlements (tenant_id, module_key, is_enabled, config_json)
      VALUES (t.id, entry->>'module_key', true, entry->'config_json');
  END LOOP;
  INSERT INTO public.companies (tenant_id, code, name, status)
    VALUES (t.id, t.tenant_code || '_MAIN', t.name, p_subscription->>'status');
  UPDATE public.tenants SET status = p_subscription->>'status', updated_at = now() WHERE id = t.id;
  UPDATE public.saas_workspace_operations SET status = 'COMPLETE', admin_user_id = p_admin_user_id WHERE request_id = p_request_id;
  RETURN jsonb_build_object('tenant', to_jsonb(t), 'complete', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_apply_billing_operation(p_tenant_id uuid, p_actor_id uuid, p_request_id uuid, p_kind text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  t public.tenants%ROWTYPE;
  s public.tenant_subscriptions%ROWTYPE;
  previous public.saas_billing_events%ROWTYPE;
  source_event public.saas_billing_events%ROWTYPE;
  seats integer;
  old_seats integer;
  months integer;
  hold_ids uuid[];
  active_count integer;
  charge numeric;
  tax numeric;
  expiry timestamptz;
  inv_no text;
  inv jsonb;
  response jsonb;
  paid boolean;
  invoice_kind text;
  category text;
  description text;
BEGIN
  SELECT * INTO STRICT t FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  SELECT * INTO previous FROM public.saas_billing_events WHERE tenant_id = p_tenant_id AND request_id = p_request_id;
  IF FOUND THEN
    IF previous.actor_id <> p_actor_id OR previous.operation <> p_kind OR previous.request_payload <> p_payload THEN
      RAISE EXCEPTION 'This request was already used with different details. Refresh and retry.';
    END IF;
    RETURN previous.result;
  END IF;
  IF t.status IN ('ARCHIVED', 'DELETED') THEN RAISE EXCEPTION 'Restore the workspace before changing its subscription.'; END IF;
  IF p_kind NOT IN ('RENEWAL', 'ADDON_PAYMENT', 'ADDON_PROFORMA', 'MODULE_PROFORMA', 'MODULE_PAYMENT', 'DOWNGRADE', 'SEATS_ONLY') THEN RAISE EXCEPTION 'Invalid SaaS operation.'; END IF;
  SELECT * INTO s FROM public.tenant_subscriptions WHERE tenant_id = p_tenant_id ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  old_seats := coalesce(s.user_seat_limit, 5);
  seats := coalesce((p_payload->>'new_seats')::integer, old_seats);
  IF seats < 1 OR seats > 100000 THEN RAISE EXCEPTION 'Seat limit must be between 1 and 100000.'; END IF;
  IF p_payload ? 'current_seats' AND (p_payload->>'current_seats')::integer <> old_seats THEN RAISE EXCEPTION 'Seat limit changed. Refresh and retry.'; END IF;
  months := coalesce((p_payload->>'months')::integer, 0);
  IF months < 0 OR months > 120 THEN RAISE EXCEPTION 'Invalid month count.'; END IF;
  charge := round(coalesce((p_payload->>'amount')::numeric, 0), 2);
  IF charge < 0 OR charge > 1000000000 THEN RAISE EXCEPTION 'Invalid amount.'; END IF;
  IF coalesce(p_payload->>'gst_type', 'NON_GST') NOT IN ('IGST', 'CGST_SGST', 'NON_GST') THEN RAISE EXCEPTION 'Invalid GST mode.'; END IF;
  tax := CASE WHEN coalesce(p_payload->>'gst_type', 'NON_GST') = 'NON_GST' THEN 0 ELSE round(charge * 0.18, 2) END;
  expiry := coalesce(s.valid_until, now() + interval '30 days');
  paid := p_kind IN ('RENEWAL', 'ADDON_PAYMENT', 'MODULE_PAYMENT');
  IF paid AND length(btrim(coalesce(p_payload->>'transaction_id',''))) > 0 AND EXISTS (
    SELECT 1 FROM public.saas_billing_events WHERE tenant_id=t.id AND invoice->>'status'='PAID'
      AND lower(btrim(invoice->>'transaction_id'))=lower(btrim(p_payload->>'transaction_id'))
  ) THEN RAISE EXCEPTION 'Payment reference already recorded. Check billing history before recording another payment.'; END IF;
  IF p_payload ? 'source_invoice_number' THEN
    SELECT * INTO STRICT source_event FROM public.saas_billing_events WHERE tenant_id = t.id AND invoice_number = p_payload->>'source_invoice_number' FOR UPDATE;
    IF source_event.invoice->>'status' <> 'PENDING' OR source_event.operation <> (CASE p_kind WHEN 'MODULE_PAYMENT' THEN 'MODULE_PROFORMA' ELSE 'ADDON_PROFORMA' END) THEN RAISE EXCEPTION 'This proforma was already paid or cannot be converted.'; END IF;
  END IF;
  IF p_kind = 'RENEWAL' OR (p_kind IN ('ADDON_PAYMENT', 'ADDON_PROFORMA') AND p_payload->>'billing_mode' = 'EXTEND_VALIDITY') THEN
    IF months < 1 THEN RAISE EXCEPTION 'Months must be at least 1.'; END IF;
    expiry := ((greatest(expiry, now()) AT TIME ZONE 'Asia/Kolkata') + make_interval(months => months)) AT TIME ZONE 'Asia/Kolkata';
  END IF;
  IF p_kind IN ('ADDON_PAYMENT', 'ADDON_PROFORMA') AND seats <= old_seats THEN RAISE EXCEPTION 'Choose a higher seat limit for expansion.'; END IF;
  IF p_kind IN ('DOWNGRADE', 'SEATS_ONLY') THEN
    IF p_kind = 'DOWNGRADE' AND seats >= old_seats THEN RAISE EXCEPTION 'Choose a lower seat limit for downgrade.'; END IF;
    IF p_kind = 'SEATS_ONLY' AND seats < old_seats THEN RAISE EXCEPTION 'Use the downgrade flow to reduce seats safely.'; END IF;
    SELECT coalesce(array_agg(value::uuid), ARRAY[]::uuid[]) INTO hold_ids FROM jsonb_array_elements_text(coalesce(p_payload->'hold_user_ids', '[]'::jsonb));
    IF cardinality(hold_ids) <> (SELECT count(DISTINCT id) FROM unnest(hold_ids) AS id) THEN RAISE EXCEPTION 'Duplicate HOLD selection.'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(hold_ids) selected WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles u WHERE u.user_id = selected AND u.is_approved = true
        AND lower(coalesce(u.role, '')) NOT IN ('customer', 'admin', 'tenant_admin', 'superadmin', 'super_admin', 'masteradmin', 'master_admin')
        AND coalesce(u.module_access->>'is_master_admin', 'false') <> 'true'
        AND (coalesce(t.primary_contact_email,'') = '' OR (
          lower(coalesce(u.email,'')) <> lower(t.primary_contact_email)
          AND lower(coalesce(u.emp_official_mail_id,'')) <> lower(t.primary_contact_email)))
        AND public.saas_user_in_workspace(u,t)
    )) THEN RAISE EXCEPTION 'HOLD selection contains an inactive, protected, or out-of-workspace account.'; END IF;
    SELECT count(*) INTO active_count FROM public.user_roles u WHERE u.is_approved = true
      AND lower(coalesce(u.role, '')) <> 'customer' AND lower(coalesce(u.emp_status, 'active')) NOT IN ('inactive','terminated','resigned','hold')
      AND public.saas_user_in_workspace(u,t);
    IF active_count - cardinality(hold_ids) > seats THEN RAISE EXCEPTION 'Select enough eligible users for HOLD before reducing the limit.'; END IF;
    IF p_kind = 'DOWNGRADE' THEN UPDATE public.user_roles SET is_approved = false WHERE user_id = ANY(hold_ids); END IF;
  END IF;
  IF p_kind = 'MODULE_PAYMENT' THEN
    INSERT INTO public.tenant_entitlements (tenant_id,module_key,is_enabled,config_json) VALUES (t.id,p_payload->>'module_key',true,jsonb_build_object('activated_at',now(),'paid_request_id',p_request_id))
    ON CONFLICT (tenant_id,module_key) DO UPDATE SET is_enabled = true, config_json = tenant_entitlements.config_json || EXCLUDED.config_json;
  END IF;
  IF paid OR p_kind IN ('DOWNGRADE', 'SEATS_ONLY') THEN
    IF s.id IS NULL THEN
      INSERT INTO public.tenant_subscriptions (tenant_id, plan_name, user_seat_limit, valid_from, valid_until, status, billing_cycle, amount)
        VALUES (t.id, 'SAAS_MODULAR', seats, now(), expiry, 'ACTIVE', CASE months WHEN 12 THEN 'YEARLY' WHEN 6 THEN 'HALF_YEARLY' WHEN 3 THEN 'QUARTERLY' ELSE 'MONTHLY' END, charge);
    ELSE
      UPDATE public.tenant_subscriptions SET user_seat_limit = seats,
        valid_until = CASE WHEN paid THEN expiry ELSE valid_until END,
        status = CASE WHEN paid THEN 'ACTIVE' ELSE status END,
        billing_cycle = CASE WHEN p_kind = 'RENEWAL' THEN CASE months WHEN 12 THEN 'YEARLY' WHEN 6 THEN 'HALF_YEARLY' WHEN 3 THEN 'QUARTERLY' ELSE 'MONTHLY' END ELSE billing_cycle END,
        amount = CASE WHEN p_kind = 'RENEWAL' THEN charge ELSE s.amount END WHERE id = s.id;
    END IF;
    IF paid THEN UPDATE public.tenants SET status = 'ACTIVE', updated_at = now() WHERE id = t.id; END IF;
  END IF;
  invoice_kind := CASE WHEN paid THEN 'tax_invoice' WHEN p_kind = 'DOWNGRADE' THEN 'seat_reduction' WHEN p_kind = 'SEATS_ONLY' THEN 'seat_adjustment' ELSE 'proforma' END;
  category := CASE p_kind WHEN 'RENEWAL' THEN 'RENEWAL_PAYMENT' WHEN 'DOWNGRADE' THEN 'SEAT_REDUCTION' WHEN 'SEATS_ONLY' THEN 'SEAT_ADJUSTMENT' WHEN 'MODULE_PROFORMA' THEN 'ADDON_MODULE' WHEN 'MODULE_PAYMENT' THEN 'ADDON_MODULE' ELSE 'ADDON_SEATS' END;
  description := CASE p_kind WHEN 'RENEWAL' THEN 'Subscription renewal'
    WHEN 'DOWNGRADE' THEN format('Seats reduced from %s to %s', old_seats, seats)
    WHEN 'SEATS_ONLY' THEN format('Seat limit adjusted from %s to %s', old_seats, seats)
    WHEN 'MODULE_PROFORMA' THEN 'Module add-on request: ' || (p_payload->>'module_key') WHEN 'MODULE_PAYMENT' THEN 'Module activation: ' || (p_payload->>'module_key')
    ELSE format('Seat expansion: +%s users; total limit %s', seats - old_seats, seats) END;
  inv_no := (CASE WHEN paid THEN 'INV' WHEN p_kind IN ('DOWNGRADE','SEATS_ONLY') THEN 'ADJ' ELSE 'PI' END) || '-' || t.tenant_code || '-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMM') || '-' || lpad(nextval('public.saas_invoice_number_seq')::text, 8, '0');
  inv := jsonb_build_object('id', gen_random_uuid(), 'invoice_number', inv_no, 'invoice_type', invoice_kind, 'category', category,
    'description', description, 'additional_seats', CASE WHEN p_kind IN ('RENEWAL','MODULE_PROFORMA','MODULE_PAYMENT') THEN 0 ELSE seats - old_seats END,
    'total_seats', seats, 'billing_mode', coalesce(p_payload->>'billing_mode', p_kind), 'months_added', months,
    'valid_until', expiry, 'amount', charge, 'gst_type', coalesce(p_payload->>'gst_type','NON_GST'), 'gst_rate', CASE WHEN coalesce(p_payload->>'gst_type','NON_GST') = 'NON_GST' THEN 0 ELSE 18 END,
    'tax_amount', tax, 'total_payable', charge + tax, 'payment_mode', p_payload->>'payment_mode', 'transaction_id', p_payload->>'transaction_id',
    'held_users_count', coalesce(cardinality(hold_ids),0), 'status', CASE WHEN paid THEN 'PAID' WHEN p_kind IN ('DOWNGRADE','SEATS_ONLY') THEN 'COMPLETED' ELSE 'PENDING' END,
    'created_at', now());
  response := jsonb_build_object('invoice', inv, 'newSeatLimit', CASE WHEN p_kind IN ('ADDON_PROFORMA','MODULE_PROFORMA') THEN old_seats ELSE seats END,
    'additionalSeats', seats - old_seats, 'heldUsersCount', coalesce(cardinality(hold_ids),0), 'newExpiry', expiry);
  INSERT INTO public.saas_billing_events (tenant_id, actor_id, request_id, operation, request_payload, invoice_number, invoice, result)
    VALUES (t.id, p_actor_id, p_request_id, p_kind, p_payload, inv_no, inv, response);
  IF source_event.id IS NOT NULL THEN
    UPDATE public.saas_billing_events SET invoice = invoice || jsonb_build_object('status','CONVERTED','paid_invoice_number',inv_no) WHERE id = source_event.id;
  END IF;
  RETURN response;
END;
$$;

REVOKE ALL ON FUNCTION public.saas_prepare_workspace(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.saas_user_in_workspace(public.user_roles,public.tenants) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.saas_finalize_workspace(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.saas_apply_billing_operation(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saas_prepare_workspace(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.saas_user_in_workspace(public.user_roles,public.tenants) TO service_role;
GRANT EXECUTE ON FUNCTION public.saas_finalize_workspace(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.saas_apply_billing_operation(uuid,uuid,uuid,text,jsonb) TO service_role;
COMMIT;
