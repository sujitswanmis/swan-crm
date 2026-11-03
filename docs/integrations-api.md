# Tenant and branch integrations

The workspace console is one page under Settings → Integrations & API (`/settings/integrations`). It contains seven tabs: Overview, API Access, Connections, Incoming Webhooks, Outgoing Webhooks, Meta Leads, and Logs. The company and branch selectors are shared across tabs. Tabs use the `integration_tab` query parameter, for example `/settings/integrations?integration_tab=integrations_meta`; older `/settings/integrations_meta` links still open the matching tab and normalize to the single page.

The existing permission IDs remain `integrations` (Overview), `integrations_api`, `integrations_connections`, `integrations_incoming`, `integrations_outgoing`, `integrations_meta`, and `integrations_logs`. The permission matrix groups them under one Integrations & API page with seven tab controls; the sidebar has one entry. Users with access to a specific tab can open that page even if Overview is denied. Existing flat role payloads and other permission editors remain compatible.

Before database setup is complete, the tabs remain visible to authorized users. Overview shows readiness and unavailable counters as dashes. Other tabs describe their purpose and keep data actions unavailable. Both a missing integration table and a missing required rate-limit function produce this setup state; actual database errors and rate-limit denial remain errors. The page never applies migrations automatically.

## Master Admin activation

Config Master → **Tenant API & Integrations** (`/config-master/tenant_integrations`) controls the new integration endpoints. Company/Tenant and Branch/Plant selectors are shown together. Every tenant starts OFF, including tenants with previously issued API keys. The existing Automation & Webhook API and legacy `/api/webhooks/leads` retain their separate contracts.

Apply `migrations/20261101_integrations_tenant_access.sql` after the three core migrations. It adds a dedicated, service-only policy table and audited, revision-checked updates; it does not modify user roles, employee lead columns, calling configuration or existing schedules. The original atomic writer remains behind a guarded wrapper with the same arguments and result format. Its private implementation is not executable by service_role, anon or authenticated API roles.

Master Admin chooses company activation and allowed features: API Read, API Write, incoming/outgoing webhooks, external GET/pull, external push, and Meta. Branch settings inherit company defaults or restrict them. A branch cannot expand a feature that the company disallows. If any branch restricts a feature, company-wide requests for that feature must select an explicitly allowed branch; a tenant-wide key cannot bypass branch restrictions.

Tenant administrators may manage integrations in their own authorized scope after activation, without a separate per-account credential-management grant. Staff still need page permissions and explicit Manage Integrations power. Master policy commands verify the authenticated user's stored Master Admin identity on the server; a client flag or ordinary Admin role cannot grant platform access.

Every new API operation and worker execution checks current policy without a cache shared across requests. OFF blocks new requests from existing keys, prevents scheduling/claiming disabled work, and preserves pending jobs and saved connections. A policy change after a job was claimed releases its lease without consuming a retry. Work already in progress may finish. Re-enabling permits retained jobs to resume under normal batch and retry limits.

Meta app configuration is a separate prerequisite. A missing Meta app leaves Meta connection unavailable while API/webhook permissions can be prepared independently. Configure a supported Graph API version and public HTTPS origin when the platform Meta app is available; no app version or credentials are invented.

This release supports scoped Lead API access, incoming lead webhooks, outgoing lead events, external HTTP pull/manual push, and Meta Instant Form lead retrieval. Other CRM resources require separate allowlisted adapters. Existing global `/api/webhooks/leads` consumers and the Master Admin Automation API are not migrated by this update.

## Activation checklist

1. Review and apply the three `20261031_integrations_*.sql` migrations in order, followed by `20261101_integrations_tenant_access.sql`. Test on a schema copy first. The core migration uses UUID `id`, UUID `tenant_id`, `lead_ref_id` limited to 20 characters, DATE `lead_date`, and text `phone` and `assigned_to`. New lead dates and fallback reference dates use Asia/Kolkata. Confirm these types on each deployment.
2. Configure the values documented in `.env.integrations.example`. Generate the encryption key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Generate the independent worker secret and Meta verification token with cryptographically random values of at least 32 characters. Save them in the deployment's secret environment; never commit real values.
3. Master Admin enables the company and features from Config Master, then applies branch restrictions. Tenant administrators receive scoped management after activation. Grant **Manage Integrations & API Credentials** explicitly to staff who need it. Ordinary users also need an assigned branch or `module_access.integration_branch_codes`; missing ownership fails closed.
4. Create paused connections and scoped keys. A tenant administrator may choose All Branches for tenant-wide defaults or select a branch for a dedicated connection. Branch connections never expand to other branches. Selecting a branch shows its configurations; it does not grant management of tenant-wide credentials. Tenant-wide and branch-specific destinations are independent, so enabling both may intentionally deliver an event to both.
5. Confirm appropriate lead indexes before enabling API traffic. On a large live table, run any new index statements **individually, outside a transaction**, using `CREATE INDEX CONCURRENTLY IF NOT EXISTS`; do not use a blocking table rewrite. Suggested indexes, if equivalent ones do not exist:

   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS integration_leads_tenant_ref_idx ON public.leads(tenant_id, lead_ref_id);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS integration_leads_tenant_created_idx ON public.leads(tenant_id, created_at DESC, id DESC);
   ```

6. Set `INTEGRATIONS_ENABLED=true` on the staging deployment. The flag gates API access, incoming processing, worker execution and provider connection flows; configuration inspection remains available while paused.
7. Verify the scheduler and one test connection end to end. Run the negative tenant/branch tests before enabling a production connection. Neither applying migrations nor setting the flag automatically enables the optional employee-change trigger.

No secret is placed in client environment variables or localStorage. The encryption key must be retained across deployments; changing it requires a deliberate credential migration/reconnection. Keep `.next`, golden backups and all workspace files intact.

## Background worker

`POST /api/integrations/worker` accepts only `Authorization: Bearer <INTEGRATIONS_WORKER_SECRET>`. It schedules due pulls/catch-up scans, fans out events, and claims a bounded job batch. An open browser is not required.

Enable Supabase Cron, pg_net and Vault using the database owner's normal setup workflow. The scheduler migration itself creates no active job. From an authorized SQL session, call:

```sql
SELECT public.integration_install_scheduler(
  'https://YOUR_CRM_HOST/api/integrations/worker',
  'YOUR_DEDICATED_WORKER_SECRET'
);
```

The helper stores the secret in Vault and creates the dedicated `crm-integrations-worker` schedule **paused**. After readiness verification:

```sql
UPDATE cron.job SET active=true WHERE jobname='crm-integrations-worker';
```

The default cadence is once per minute. Each run claims at most five jobs, at most two per tenant; heavy historical imports therefore drain gradually. Capacity and cadence must be load-tested before increasing. A signed webhook acknowledgement means the job was stored, not that a lead has already been created.

Jobs have two-minute processing leases and up to six attempts. Transient failures retry with increasing delays capped at fifteen minutes. Permanent authentication, ownership and configuration failures remain reviewable. Expired final leases become failed jobs. Retrying a failed job preserves its identity. Receivers must deduplicate outgoing events by `X-Integration-Event-Id`; delivery is at least once, not exactly once.

## Employee-originated outgoing events

Integration API and connector writes capture their own events atomically. To also capture manual employee lead creation/updates, the separately added `crm_integrations_lead_events` trigger must be enabled after staging load verification:

```sql
SET lock_timeout='2s';
ALTER TABLE public.leads ENABLE TRIGGER crm_integrations_lead_events;
RESET lock_timeout;
```

The trigger performs only a bounded local outbox insert, never an external HTTP request. It exits when no outgoing connection is enabled. Branch-specific events require a verified `integration_record_scopes` mapping. Existing unmapped records with verified `tenant_id` may be read by a tenant-wide key but are excluded from branch APIs. Tenant administrators can map an existing tenant-owned lead to a selected branch from Overview. This operation does not infer ownership from company text and does not silently move a lead already mapped to another branch.

Trigger failures are isolated from employee saves and emit only SQLSTATE to database logs. If capture fails, that event may be missed; do not claim guaranteed delivery of every historical intermediate state. Pause the connection and investigate capture errors before relying on complete event history.

## Lead API

Use a server-side API key with the minimum required scopes. Keys expire after 1–365 days and are shown in full only at creation/rotation. Rotation immediately revokes the previous key atomically. Existing clients should prepare a planned key replacement. Never embed a key in a public website or URL.

| Method and path | Required scope |
| --- | --- |
| `GET /api/integrations/v1/leads` | `leads:read` |
| `GET /api/integrations/v1/leads/{leadCode}` | `leads:read` |
| `POST /api/integrations/v1/leads` | `leads:create` |
| `PATCH /api/integrations/v1/leads/{leadCode}` | `leads:update` |
| `GET /api/integrations/v1/lookups` | `lookups:read` |

The console also uses a session-authenticated, same-origin **POST** on the lookups route for its internal commands. API keys do not authorize that console endpoint. Its independent HTTP transport avoids sharing Next's serialized client Server Action dispatcher with calling actions.

List filters: `page` (1–10000), `page_size` (10/25/50/100), `search`, `status`, `branch_code`, `from_date`, `to_date`. Calendar filters use `YYYY-MM-DD` in Asia/Kolkata; the To date includes the full IST day. A branch key remains bound to its branch even when the query omits it. A tenant-wide key may narrow to a verified branch, but no key can switch tenant.

```sh
curl 'https://YOUR_CRM_HOST/api/integrations/v1/leads?branch_code=TNT00002-B0001&page_size=25' \
  -H 'Authorization: Bearer YOUR_API_KEY'

curl -X POST 'https://YOUR_CRM_HOST/api/integrations/v1/leads?branch_code=TNT00002-B0001' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: website-enquiry-000001' \
  -d '{"name":"Example enquiry","phone":"9876543210","source":"Website","requirement":"Product information"}'
```

Writes require a stable 8–128 character `Idempotency-Key` (letters, digits, `.`, `_`, `:`, `-`). Reusing it within the same key/branch scope with different normalized data or a different target lead returns 409. Matching contacts are checked within the authorized tenant/branch and returned as `duplicate`; employee data is not overwritten by a duplicate create. A PATCH changes only supported supplied fields. Agent assignments and stage codes must be present in the authorized lookups. The database transaction includes the lead, ownership mapping, event and receipt.

Allowed fields: `name`, `phone`, `email`, `company` (the prospect's firm), `city_name`, `district_name`, `state_name`, `address`, `pin_code`, `requirement`, `source`, `source_name`, `priority`, `status`, `assigned_to`. Internal UUIDs, `tenant_id`, `our_company`, actor fields and arbitrary database columns are not accepted. The server constructs internal tenant/operating-company values. External identifiers are CRM `lead_code`, `tenant_code` and `branch_code`; timestamps exposed by the Lead API and outgoing envelope use `+05:30`.

## Incoming webhooks

Create an Incoming Webhooks connection and copy its endpoint and one-time secret:

`POST /api/integrations/incoming/CON_CONNECTION_CODE`

Default HMAC authentication uses:

```text
X-Integration-Timestamp: Unix seconds
X-Integration-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + exact UTF-8 body)>
```

The timestamp must be within five minutes. Bearer-secret mode is available for senders that cannot sign payloads. Authentication is checked before queue insertion. Field mapping uses destination CRM field → scalar source path. Map `external_id` to a stable source record identifier; otherwise an exact-body hash deduplicates repeated deliveries. Reusing a source ID does not create a second lead. Return 202 is sent only after durable enqueue; a storage failure returns an error for the sender to retry.

Example mapping: `{"name":"customer.full_name","phone":"customer.mobile","external_id":"submission_id"}`. Paths never evaluate code or traverse object prototypes.

## External connections and outgoing webhooks

External pulls use GET against a configured HTTPS endpoint. A response page may contain up to 100 records/1 MiB. Configure the records-array path (empty for a top-level array), field mapping, optional next-cursor path, cursor parameter, and non-secret query parameters such as `limit=50`. Returned continuation URLs are never followed. Use a stable `external_id`; mapped lead records are encrypted before queueing.

External manual push uses POST/PATCH for an explicitly selected, authorized CRM lead. Push mapping is external field → public CRM field. Empty mapping sends the public lead projection. Arbitrary writes to unsupported CRM tables are unavailable.

Outgoing events: `lead.created`, `lead.updated`, `lead.stage_changed`, `lead.assigned`. The default signed envelope contains `event_id`, `event_type`, `occurred_at`, tenant/branch codes and public lead `data`. A custom mapping may select/rename scalar envelope paths; include the event identity in that mapping if the receiver deduplicates by body. Headers always include stable `X-Integration-Event-Id`, timestamp and HMAC signature. Queue test sends a clearly labeled `TEST-LEAD` event; it does not create a CRM lead.

Destinations must be public HTTPS hosts on port 443. Embedded credentials, URL query strings, private/link-local/loopback/reserved addresses, mixed public/private DNS results and redirects are rejected. Every delivery revalidates DNS and pins the verified address while retaining TLS hostname verification. Requests and responses have size and absolute timeout limits. Tokens, payloads and raw provider errors are excluded from processing/audit logs.

## Meta Lead Ads

Use a Meta app with the required approved access for the intended businesses. Set an explicitly supported `META_GRAPH_API_VERSION`; this release intentionally does not assume a current version. Prefer the app's reviewed Facebook Login for Business configuration via `META_LOGIN_CONFIG_ID`, or review `META_OAUTH_SCOPES` against the current [Meta lead retrieval documentation](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/).

Configure:

- OAuth redirect: `https://YOUR_CRM_HOST/api/integrations/meta/callback`
- Page webhook: `https://YOUR_CRM_HOST/api/integrations/meta/webhook`, field `leadgen`
- Deauthorization callback: `https://YOUR_CRM_HOST/api/integrations/meta/deauthorize`
- Privacy policy and data-deletion request/instructions URL appropriate to your business. This update does not publish a privacy policy or claim that app review is complete.

Create a paused Meta connection, select it, connect Meta, load authorized Pages/forms, save routing/mapping and enable the connection. Full Page/lead access must be granted to the app. OAuth state expires after five minutes, is single use and is bound to the authenticated user, tenant, branch and connection. The login token is exchanged for a long-lived user token before deriving Page tokens; both exchange requests send secrets in the POST body. Tokens are encrypted. Expired/removed access changes the connection to Needs reconnect. An active form mapping cannot overlap another active mapping, including in a different tenant.

Meta webhook signatures are verified against the exact raw body using the app secret. Only notifications matching the saved Page/form mapping are queued. The worker retrieves the lead via the Page token and verifies its form again. Standard `full_name`, `phone_number`, `email`, `company_name` are recognized; custom scalar mappings are supported. Unmapped custom answers are appended to requirement. Page/form/ad identifiers and submission timestamp are retained in restricted provenance metadata.

Manual history sync requests a chosen IST date within ninety days; actual availability is controlled by Meta. Catch-up scans revisit the last two days at the configured interval and deduplicate by Meta lead ID. Use [Meta's Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing/) to verify one real test-lead round trip. A subscription dashboard sample with fabricated IDs is not proof of actual retrieval.

## Verification and safe pause

Run the seven `tests/integrations-*.test.mjs` files with Node's test runner. The queue suite optionally executes the SQL migrations twice and exercises real PostgreSQL transactions in isolated PGlite memory when `INTEGRATION_SQL_TEST_MODULE` points to a separately installed PGlite `dist/index.js`; it never connects those tests to production. Check negative branch/tenant access, key revocation, tampered signatures, duplicate requests, lease recovery, Meta mapping conflicts and preserved Settings permissions.

Before rollout, verify an authenticated UI session, Role & Permission Matrix entries, a stage/assignment choice, one incoming lead, one outgoing receiver, and Meta authorization/retrieval with configured credentials. Local tests cannot establish Meta approval, production network reachability or live database load behavior.

To pause, set `INTEGRATIONS_ENABLED=false`, pause connections and set the dedicated cron job inactive. If the optional employee-change trigger was enabled, disable only `crm_integrations_lead_events` using a short lock timeout. Keep jobs/data/configuration, existing files and all golden backups intact. No automatic commit, push or production migration is part of local verification.

## Local verification — 1 November 2026 (IST)

- 60 tests passed, including real isolated PostgreSQL execution of all migrations twice, scoped writes, duplicate protection, key rotation/revocation, atomic retry/audit, lease recovery, Meta routing conflicts and IST dates. The added page tests verify a single sidebar entry, seven visible tabs before database setup, API-only permissions, legacy links, disabled setup actions and successful console bootstrap for partial migrations.
- Targeted ESLint passed for the integration backend, routes, UI and test files. The shared CRM container and permission modal retain their existing lint findings; their error counts did not increase. Existing Settings hook-dependency warnings remain.
- An isolated webpack production build passed, including all nine integration routes. Existing Plivo default-export, middleware convention and Edge-runtime warnings remain outside this update's protected calling scope.
- Fourteen HTTP checks against the compiled output passed: global pause, missing API/worker authentication, invalid Meta verification/signatures, invalid incoming connection codes, cross-site console denial, local/canonical-origin session enforcement, protected page redirects and rejection of unauthenticated Master policy commands with forged client flags. These checks made no production data changes.
- The current Settings navigation has 12 pages and 18 permission entries, including the single Integrations page and its seven stable tab IDs. Config Master has eight registered pages, including Tenant API & Integrations; its matrix rows are locked for tenant roles. Staff do not inherit credential-management power.

After the SQL Editor step, read-only API metadata verification confirmed the policy table and policy/paused-job functions are available. Local encryption, worker and webhook verification secrets are configured without changing existing environment entries. The local integration server is enabled; tenant policies still require explicit Master Admin activation. No tenant account permission was changed by this update.

Authenticated live UI verification, production load verification and a real Meta test lead remain deployment checks. The user has not created a Meta app yet. Public HTTPS origin, Meta app configuration and a reachable background worker schedule must be completed for provider webhooks and queued delivery. Local API configuration does not establish those external prerequisites. No commit or push was performed.
