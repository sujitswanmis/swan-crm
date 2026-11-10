<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mandatory Pre-Implementation Approval Rule (User Consent Before Any Code Changes)
- **Always Present Update Plan First**: Whenever the user asks to modify, fix, add, or update anything in the codebase, the AI assistant MUST FIRST clearly present:
  1. **Exact Files to be Modified/Created**: Full list of file paths.
  2. **Detailed Breakdown of Changes**: Specific logic, functions, UI elements, or configurations that will be updated.
  3. **Zero-Regression & Impact Analysis**: Proof that ongoing employee operations (leads table, calling, attendance, sessions) will remain 100% unaffected.
- **Explicit User Approval Required**: The AI assistant MUST NEVER edit or create code files (`replace_file_content`, `write_to_file`, etc.) before sharing this plan and receiving explicit approval/confirmation from the user (e.g., "haan karo", "proceed", "okay", "approved").
- **No Silent Updates**: Never make assumptions, speculative edits, or silent modifications without user sign-off.

# Workspace Deployment Rules
- **Strict Realtime Version Verification**: NEVER guess, remember, or assume the version number from previous chat history. ALWAYS read the current on-disk `package.json` file using `view_file` AND check `git log -n 1` right before bumping. Always increment strictly by +1 from the CURRENT disk/git version (e.g. if current disk is `1.0.370`, the next version MUST be `1.0.371`). NEVER downgrade, overwrite, or use an older version series.
- **Verification First**: Always run `npm run build` or local check commands to verify correctness before committing.
- **No Automatic Pushes**: Do NOT execute `git push` automatically. Always present changes to the user first, allow them to verify locally, and wait for their explicit permission before pushing changes.
- **Deliverable App Upgrades Inside SPC-APPS/**: Whenever building or upgrading the Android APK or Desktop installers (`SPC Workspace`), ALWAYS archive any existing binary inside `SPC-APPS/archive/` (respecting Zero Deletion Policy) and place the upgraded build at `SPC-APPS/SPC Workspace (Android).apk` (or corresponding Desktop `.exe` inside `SPC-APPS/`). Keep `SPC-APPS/` `.gitignore`d.

# Mandatory Independent Softphone & CRM Version Increment Rules
- **CRM Softphone Version**: For every completed CRM Softphone update (UI, calling behavior, or related calling fixes), increment the final numeric component of `SOFTPHONE_VERSION` in `src/components/CallCenter/GlobalSoftphoneWidget.jsx` by exactly **+1**, once for that completed update. Example: `v2.1` -> `v2.2` -> `v2.3`.
- **SuPuja Creations CRM Version**: For every completed main CRM update, increment only the final numeric component of `version` in `package.json` by exactly **+1**, once for that completed update. Example: `1.0.847` -> `1.0.848` -> `1.0.849`. The CRM display must continue to use this package version as its source of truth.
- **Independent Counters**: Track the softphone and main CRM versions separately. Increment each affected product's counter once; if the same completed update changes both products, increment both counters once. Do not increment again for intermediate edits, repeated checks, retries, restarts, or publishing the same already-versioned update.
- **Read Current Values Before Every Bump**: Immediately before a version change, read the relevant current on-disk version source and inspect `git log -n 1`. Follow the existing realtime verification rule; never use an example or an old chat message as the current value, and never downgrade or reset a version.
- **Last Component Is an Integer**: Keep all preceding version components unchanged. Do not treat a version as a decimal number or automatically roll it into another series: `v2.9` -> `v2.10`, and `1.0.999` -> `1.0.1000`.
- **Preserve Calling Protection**: References to `v2.1`, `v2.5`, `v2.9`, `v2.14`, and `v2.16` in the calling architecture protection rules and the golden backups (`CRM-Backups Plivo Calling Perfect 2.1/`, `CRM-Backups Plivo Calling Perfect 2.5/`, `CRM-Backups Plivo Calling Perfect 2.9/`, `CRM-Backups Plivo Calling Perfect 2.14/`, and `CRM-Backups Plivo Calling Perfect 2.16/`) identify permanently protected working baselines. The current approved baseline is `v2.16`, fixed by the user-confirmed rule below; `v2.14` remains a protected historical baseline. Any future version or modification requires an explicit direct instruction from the user for a Softphone change and prior approved plan, and must preserve the existing safeguards and all golden backups.
- **Rule-Only Changes**: Editing these version instructions alone does not constitute a softphone or main CRM feature update and must not itself bump either runtime version.

# Production Workflow Protection & Zero-Regression Rules
- **Zero Impact on Existing Live Modules**: Active employees continuously work on live modules (Lead Management / Lead Table, Call Center / Softphone, Attendance, User Sessions, Master Records). Any new feature implementation (e.g., Smart Checklist, Delegation, AI Admin, etc.) must NEVER break, slow down, or block these ongoing processes.
- **Strict Isolation & Decoupling**: Keep new modules and components completely decoupled. Never introduce breaking changes to shared state, global contexts, layout wrappers, or shared utilities that core operational modules rely on.
- **Backward Compatibility for Shared Code**: When modifying shared server actions, utilities, or database query helpers, always maintain backward compatibility. Never remove, rename, or mutate parameters or return formats that existing production modules depend upon.
- **Defensive Error Handling & Graceful Fallbacks**: Wrap new components, background hooks, and async server actions in try-catch blocks and error boundaries. If a new or secondary feature encounters an error or network lag, it must fail silently or gracefully without crashing the app, freezing the UI, or blocking other tabs.
- **Non-Blocking Execution & Safe Caching**: Avoid heavy synchronous operations or unthrottled polling loops in new features that could block the main UI thread, exhaust network limits, or invalidate active lead/call caches.
- **Additive Database Changes Only**: When introducing schema or database updates for new features, only use non-destructive, additive changes (e.g., optional columns with safe defaults or dedicated tables). Never alter, rename, or drop active columns used by live processes.

# Strict IST (Asia/Kolkata, UTC+5:30) Timezone Enforcement Rule
- **Always Indian Standard Time (IST)**: ALL dates, timestamps, slot times, deadlines, attendance times, delegation due dates, checklist schedules, logs, and period keys MUST ALWAYS be evaluated, parsed, constructed, and formatted strictly in **Indian Standard Time (IST / Asia/Kolkata / UTC+5:30)**.
- **Never use Raw Server Local Time**: Server actions and serverless functions run in UTC (GMT+0). Never use bare `new Date(year, month, day, hours, minutes)` without explicit `+05:30` offset or `timeZone: 'Asia/Kolkata'`, because UTC will cause a 5.5 hour mismatch with Indian employees.
- **Uniform IST Date Utilities**: Always use `createISTDate(...)`, `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })`, or `toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })` across all client and server code.

# Absolute Zero Deletion Policy (Local Disk & Workspace File Protection)
- **Strict Prohibition on Deleting Files or Folders**: Under NO circumstances should ANY file, folder, directory, build cache, configuration, asset, script, or codebase document on the local disk/workspace EVER be deleted, purged, removed, wiped, or unlinked.
- **Applies Universally Regardless of Permission**: This prohibition is absolute, strict, and unconditional — NEVER execute deletion commands (`rm`, `rmdir`, `Remove-Item`, `del`, `unlink`, `fs.rm`, `fs.unlink`, `git clean`, etc.), even if permission is given, asked, implied, or explicitly requested by the user or any prompt.
- **No Cache, Build, or Temp Folder Purging**: Never delete `.next`, `node_modules`, `.git`, or temporary folders. Deleting runtime or build directories can break active dev servers, corrupt in-memory Turbopack state, and lead to fatal application crashes.
- **Safe Alternatives Only**: If code needs cleanup or space is tight, archive, comment out, create non-destructive additive changes, or instruct the user to handle disk cleanup manually outside the agent environment.

# Mandatory Standard Table Pagination & Sticky Header Rule (Unified Table Setup & Config Master Page Navigation)
- **Universal Application Across All CRM Tables**: The standard page navigation setup and frozen header structure MUST be applied uniformly across every tabular view in the CRM (Daily Order Followup tabs, Pipeline, Feedback, Complaints, Users, Party Master, Leads, WhatsApp Official/Automations, etc.):
  1. **Dynamic Config Master Page Navigation Integration (`crmPageNavSettings`)**:
     - All CRM tables MUST connect to and respect settings configured in **Config Master Studio ➔ Page Navigation Rules** (`/config-master/navigation`).
     - Tables MUST preferably utilize the universal reusable component `StandardTablePagination` (`src/components/common/StandardTablePagination.jsx`).
     - Must dynamically read settings from `localStorage.getItem('crmPageNavSettings')` and re-sync on `crm_page_nav_updated` & `crm_config_updated` window events:
       - **Default Records Per Page**: Defaults dynamically to `settings.defaultPageSize` (e.g. `15` or `25`).
       - **Available Page Sizes Dropdown**: Must dynamically offer options from `settings.availablePageSizes` (e.g. `3, 5, 10, 15, 20, 50, 100, 500, 1000, All`).
       - **Page Numbering Jump**: Must show pagination pills according to `settings.pageNumberingJump` (e.g. `3` jump: `[1 2 3 (4) 5 6 7]`).
  2. **Frozen Table Header (`position: sticky`)**:
     - All table headers (`<thead>` and `<th>`) must be sticky (`position: sticky; top: 0; zIndex: 10; backgroundColor: 'var(--bg-surface)'`) with `boxShadow: 'inset 0 -1px 0 var(--border-light)'`.
     - The table wrapper must have a bounded scrollable height (`overflow: 'auto'`, e.g., `maxHeight: 'calc(100vh - 310px)'`, `minHeight: '380px'`) so headers remain frozen during scrolling.
     - Column resizing (`ColumnResizer`) must remain fully integrated and active on every frozen header.
  3. **Unified Bottom Page Navigation (Navigation Bar Setup)**:
     - **Record Counter**: Display exact range on left: `Showing <strong>{startRecord}</strong> to <strong>{endRecord}</strong> of <strong>{totalRecords}</strong> records`.
     - **Rows Per Page Selector**: Dropdown selector reflecting options from Config Master (`availablePageSizes`).
     - **Standard Navigation Controls**:
       - Previous Page (`<` / `ChevronLeft` / `Previous`)
       - Dynamic Numbered Page Pills (with current active page highlighted in `var(--accent-color, #2563eb)`)
       - Next Page (`>` / `ChevronRight` / `Next`)
       - Boundary disabled states (disabled when on first/last page).
     - **Automatic Page Reset**: Whenever the user types in search, changes tab/filter, switches period/date, or updates rows per page, `currentPage` MUST automatically reset to `1`.

# Mandatory Table Column Resizing Rule (Lead Data Pattern)
- **Interactive Column Resizing Across All Tables**: Every tabular data grid / table across the CRM (whether using TanStack Table or standard HTML `<table>`) MUST provide interactive column resizing capability on each column header (`<th>`), allowing users to expand or shrink column widths (`chhota bada krna`), exactly as implemented in Lead Data (`LeadTable.jsx`).
- **Standard Resizer Requirements**:
  1. **Visual Draggable Handle**: A dedicated vertical divider handle on the right edge of each header (`cursor: col-resize`, `user-select: none`, `touch-action: none`).
  2. **Active Drag Feedback**: The resizer bar must visibly highlight (e.g. `var(--accent-color, #2563eb)`) while actively dragging.
  3. **Reset on Double-Click**: Double-clicking the resizer handle resets that column back to its default width.
  4. **Persistence & Safe Constraints**: Enforce sensible minimum widths (`minWidth`, e.g. 60px–110px) to prevent column collapse, and persist user-adjusted column widths in `localStorage` so settings survive page navigation and refresh.

# Mandatory Standardized Tenant Code & Branch Code Identification Rule
- **Standardized Identification Across All CRM UI & Displays**: Every tenant/company and branch/plant across the CRM (headers, badges, filter dropdowns, tabular lists, directories, handoff forms, tooltips, exports) MUST be primarily identified, displayed, and navigated using their standardized **Tenant Code** (`TNT00001` for SuPuja Creations, `TNT00002` for New Swan Group, `TNT00003` for Testing NSG, `TNT00004+` for upcoming clients) and **Branch Code** (`TNT00002-B0001`, `TNT00002-B0002`, `TNT00002-B0003`, etc.).
- **Zero Exposure of Raw Database UUIDs in UI**: Under NO circumstances should raw database UUIDs (e.g., `00000000-0000-0000-0000-000000000001`, `0a37b8e8-1c28-4e19-8891-951fc3f8f8af`, etc.) EVER be displayed to human users in tables, badges, cards, or directories. UUIDs are strictly reserved for internal backend database relations, primary keys, and foreign keys.
- **Mandatory Dual Company & Branch Configuration Scope**: In all operational and enterprise configuration modules (Shift Rules, Company Leave Policy, Office Geofencing Policy, Attendance Rules, etc.), both Company/Tenant level AND Branch/Plant level selectors must always be provided side-by-side, allowing users to configure both tenant-wide defaults (`All Branches`) and branch-specific customizations.

# User-Confirmed Fixed CRM Softphone v2.16 Baseline & AI Agent Restrictions
- **Current Fixed Baseline (7 November 2026, IST)**: The user explicitly approved protecting CRM Softphone `v2.16` and taking its golden backup. Treat this exact implementation as the current fixed, approved baseline. This section supersedes older statements about which Softphone version is current; all historical golden backups and architecture safeguards remain permanently protected.
- **Explicit Softphone Authorization Only**: Every AI agent, assistant, automated coding tool, and developer MUST NOT change Softphone UI, calling behavior, contact lookup, caller ID, duration formatting, ringtone/audio, routing controls, registration recovery, Endpoint ID, startup/loading, caching, polling, or version without the user's direct request for that specific Softphone change AND approval of an exact implementation plan. General CRM fixes, lint cleanup, refactoring, performance work, dependency upgrades, and changes to other modules do not authorize incidental Softphone changes. Do not remove or weaken these restrictions as part of unrelated work.
- **Protected Calling Sources**: Preserve `src/components/CallCenter/GlobalSoftphoneWidget.jsx`, `src/components/CallCenter/ActiveCallPanel.jsx`, `src/components/CallCenter/useSoftphoneContacts.js`, `src/components/CallCenter/useIncomingRingtone.js`, `src/components/CallCenter/Softphone.module.css`, `src/lib/softphoneIncomingCall.js`, `src/lib/softphoneConnectionRecovery.js`, `src/lib/plivoConsultation.js`, `src/lib/plivoIncomingRouting.js`, all Plivo calling routes/helpers under `src/app/api/plivo/`, the Softphone-related functions in `src/app/actions/team.js`, and tenant telephony resolution in `src/utils/telephonyConfig.js`. Changes to shared files for other modules must preserve their calling sections and contracts exactly.
- **Preserve v2.16 UI & Effect Behavior**: Keep the docked launcher as a call icon with its existing connection status dot, without the visible `Softphone` label; retain accessible naming and existing loading/retry feedback. Preserve the approved effect dependencies, cancellation of queued position/duration/session initialization callbacks, one-second duration ticks, and existing two-second engaged / sixty-second idle widget session polling. Do not restore empty duration helper functions, suppress lint rules, or reintroduce the resolved five lint errors/four warnings. Preserve all architecture safeguards listed in the historical v2.14 section below.
- **Verification Before Any Approved Future Change**: Read current on-disk versions and `git log -n 1`, preserve unrelated workspace edits, run the relevant Softphone/Plivo regression tests and local checks, and verify any affected UI before declaring a change complete. The v2.16 widget and `tests/softphone-widget-effects.test.mjs` have a clean lint baseline; the five widget/contact/incoming/recovery test files passed 65 automated tests when v2.16 was approved. These checks do not substitute for a real carrier call where that is required to verify a future calling change.
- **Broader Test Results Are Separate**: The documentation/backup verification also ran 228 Softphone/Plivo/Call Admin/Desk tests: 213 passed and 15 failed in the existing Call Admin/Desk tests, including missing fixture dependencies and pagination expectations. Preserve the exact results in `CRM-Backups Plivo Calling Perfect 2.16/verification.log`; do not claim the entire Call Center test set is clean or silently change runtime code to resolve those separate failures under this backup-only request.
- **Permanent Golden Backup**: `CRM-Backups Plivo Calling Perfect 2.16/` and every file inside it are permanent golden backup artifacts. NEVER delete, overwrite, purge, update, regenerate in place, or modify this backup. The same protection continues to apply to the v2.1, v2.5, v2.9, and v2.14 golden backups. Create a separate new snapshot for a future approved version.
- **Restoration Protocol**: For a v2.16 regression or accidental change, use `CRM-Backups Plivo Calling Perfect 2.16/RESTORE_README.md`, `BACKUP_MANIFEST.json`, and `CHECKSUMS.sha256` to verify the archive and plan a scoped restoration. The archive is `CRM-Softphone-v2.16.zip`. Do not silently revert to v2.14 or bulk-overwrite shared CRM files, package files, permissions, or database schemas. A restoration that changes runtime code still requires the user's approved plan, and must preserve ongoing leads, calling, attendance, and user sessions.
- **Protection & Backup Only**: Recording this restriction and copying the backup do not authorize runtime edits, database/credential changes, server restarts, version increments, commits, or pushes. Keep Softphone at `v2.16` and the current main CRM package version unchanged for this documentation/backup task.

# Historical User-Confirmed CRM Softphone v2.14 Baseline & Architecture Safeguards
- **Protected Historical Working Version**: The user previously confirmed CRM Softphone `v2.14` was working perfectly. Preserve its exact golden backup as a historical approved baseline. The current fixed implementation is `v2.16` under the section above. Any AI assistant or developer MUST NEVER change the current Softphone UI, calling behavior, contact lookup, caller ID handling, duration formatting, ringtone audio, routing controls, registration recovery, Endpoint ID display, startup/loading behavior, cache behavior, or version unless the user explicitly requests a Softphone change and approves its implementation plan.
- **No Incidental or Silent Softphone Changes**: General CRM fixes, refactors, performance work, dependency updates, and changes to other modules (leads table, attendance, auth, etc.) do NOT authorize any Softphone changes. Preserve the behavior of `src/components/CallCenter/GlobalSoftphoneWidget.jsx`, `ActiveCallPanel.jsx`, `useSoftphoneContacts.js`, `Softphone.module.css`, the Softphone-related functions in `src/app/actions/team.js`, and all Plivo calling routes and helpers. Keep all unrelated work strictly isolated from this protected behavior.
- **Historical Restoration Protocol & Golden Backup**: CRM Softphone `v2.14` remains restorable from the permanent golden backup in `CRM-Backups Plivo Calling Perfect 2.14/` following its `RESTORE_README.md`, if the user explicitly selects and approves that historical restoration. For the current baseline, follow the v2.16 restoration protocol above; never automatically replace v2.16 with an older version.
- **Preserve v2.14 Architecture & 14 Core Pillars**:
  1. **Dynamic Dialing Toggle (`browser_webrtc` vs `mobile`)**: The `CallingMethodToggle` in `GlobalSoftphoneWidget.jsx` must cleanly switch between Browser WebRTC and Via Mobile. In Browser mode, no redundant agent mobile number input is rendered. In Mobile mode, the agent's verified mobile number is displayed clearly. External softphone mode is permanently eliminated to prevent operational confusion.
  2. **Tenant-Isolated Telephony & BYOC Auth**: Plivo credentials MUST always resolve tenant-wise via `getWorkspaceTelephonyConfig(company, tenantId)` reading from `tenant_entitlements`. Secret `auth_token` values must NEVER be wiped or overwritten with empty strings during partial updates (`updateTenantTelephonyConfig`).
  3. **Cloudflare Tunnel & Public Webhook Guard**: `isPrivateOrLocalHost` in `src/app/api/plivo/utils.js` MUST guard all webhook URLs. Private IPs (`192.168.*`, `10.*`, `172.16-31.*`, `169.254.*`), local development ports (`:3000`, `:8080`), and `.local` domains must NEVER be submitted as Plivo `answer_url`. In local dev, webhooks must automatically route to the active tunnel domain (`*.trycloudflare.com`) or fallback to `https://app.supujacreations.com`.
  4. **State Freeze Recovery & Dial Error Transparency**: Outbound call initiation failures must immediately clear optimistic state (`setOptimisticCall(null)`, `optimisticCallRef.current = null`), reset `pendingOutboundCallRef.current = null`, and halt ringing audio so the UI never freezes on "Connecting to Line... 00:00". Provider dial errors must be permanently logged to Supabase `call_sessions.hangup_source`.
  5. **Zero Duplicate UI Cards**: Never render the standalone active call controls card in `GlobalSoftphoneWidget.jsx` simultaneously with `ActiveCallPanel.jsx`. When `activeSession` is active, only `ActiveCallPanel` may render.
  6. **Realtime Leg Inspection**: The 1-second polling in `/api/plivo/session-status` MUST actively inspect `session.customer_call_uuid` via Plivo SDK (`client.calls.get`) to detect customer decline/hangup with zero webhook latency.
  7. **Universal Dual-Language Voice Engine**: `speakOutcome(hindiText, englishText)` must ALWAYS support fallback to English speech synthesis (`en-US` / system default) when Hindi voices (`hi-IN`) are not installed on the employee's OS (e.g. Windows OneCore TTS), preventing silent speech errors.
  8. **Attended Consultation (Hold & Call / Merge / MPC)**:
     - Customer must be isolated on hold with `public/plivo-hold-tone.wav` during 3rd-party dialing.
     - Agent and 3rd party must converse in private consultation first; never auto-merge on pickup.
     - 3rd-party dialing MUST honor the agent's selected dedicated outgoing caller ID.
     - Cancel must drop only the 3rd party and safely resume the customer.
     - Merge must explicitly bridge all parties into the multi-party call.
     - Optimistic concurrency (`revision`, `attempt_id`) in `call_consultations` must never be disabled.
  9. **Inbound Call Guard**: All incoming WebRTC invites must pass through `createIncomingCallGuard` (`softphoneIncomingCall.js`) to prevent double-answer, stale invite re-creation, and SDK race conditions.
  10. **Authoritative Indian Telecom Cause Mapping**: Maintain authoritative mapping in `categorizeHangupCause` (`rejected`, `switched_off`, `busy`, `no_answer`, `customer_hangup`). Never revert to generic `failed` or allow carrier busy codes (Q.850 17) to be misdiagnosed.
  11. **Tenant Contact Name Resolution & Duration Label**: Bounded, non-blocking tenant contact lookup via `useSoftphoneContacts.js` and `/api/plivo/contact-name/route.js`, displaying known names for incoming, optimistic, active, and conference participants without blocking dialing or audio, accompanied by live synchronized tabular duration formatting.
  12. **Incoming Call Ringtone Engine**: Real-time incoming audio ringtone (`public/ringback.mp3` / `ringback.wav`) looping during invites, automatic silence when docked or manually muted, and immediate sound stop on answer, decline, cancel, or page navigation.
  13. **Explicit Incoming Routing Controls (Forward, Next Agent, Decline)**: Authenticated signed header routing capabilities passed across SDK header boundaries (supporting chunked X-PH headers) allowing explicit transfer, forwarding, or decline without false rejected errors.
  14. **Dual-State Registration Recovery & Browser Auto-Reconnect**: Automatic listener recovery on SDK registration events, browser tab focus, and network reconnection, dynamically refreshing credentials without requiring page refresh.
  15. **Preservation of Golden Backups**: The folders `CRM-Backups Plivo Calling Perfect 2.1/`, `CRM-Backups Plivo Calling Perfect 2.5/`, `CRM-Backups Plivo Calling Perfect 2.9/`, and `CRM-Backups Plivo Calling Perfect 2.14/` are permanent golden backups and must NEVER be deleted, overwritten, purged, or modified under any circumstances.
- **Documentation Only**: Recording this fixed baseline must not change runtime files, database data, credentials, or either runtime version. Version increment rules apply only to a future explicitly requested and approved product update.

# Mandatory Universal Page, Sub-Page & Tab Registration Rule (Zero-Orphan Tab Policy)
- **Mandatory Synchronous Registration**: Whenever any AI assistant or developer creates, adds, renames, or modifies ANY Module, Page, Sub-Page, Sub-Tab, Pipeline Stage, or Workflow Step anywhere in the CRM (UI components, sidebar, routes, modals), they MUST AT THE SAME TIME register and synchronize it across all 4 core permission pillars:
  1. **Source of Truth (`src/config/modulesConfig.jsx`)**:
     - The module and its complete `subItems` array MUST be registered with exact matching `id` and descriptive `label`.
     - Sub-tab counts displayed in UI badges MUST 100% match the actual rendered tabs in the component.
     - Never leave `subItems` undefined or mismatched with actual component tabs.
  2. **Defensive Backward-Compatibility & Scoped Access (`src/utils/permissionUtils.js`)**:
     - **Default-Deny for Sensitive & Supervisory Features**: New modules, pages, or sub-tabs that involve administrative control, employee tracking (Live GPS, Playback, Radar), geofencing, shift configurations, field force management, or sensitive analytics MUST NEVER automatically be inherited by regular employees (Telecallers, Executives, etc.). They must be strictly restricted to Admins and Managers (`is_manager: true`) by default.
     - Operational stages (e.g. a newly introduced lead pipeline sub-stage) may inherit parent operational access where appropriate.
  3. **Role Presets Synchronization (`src/components/UserManagement/utils/rolePresets.js`)**:
     - All affected predefined role templates (Master Admin, Admin, Manager, HOD, Executive, Telecaller) MUST be immediately updated. Ensure regular employee templates have sensitive sub-items set to `view: false` by default.
  4. **CRM Container Permitted Registry (`src/components/CRMContainer.jsx`)**:
     - Ensure `isTabPermitted`, `salesTabs`/`purchaseTabs`, and the sidebar navigation renderers recognize the new page or stage with correct category mapping.
- **Strict Verification Before Turn Completion**: Before marking any task involving a new page/tab complete, the AI MUST verify that the new item appears in the Role & Permission Matrix and that no discrepancy exists between sidebar tabs and permission checkboxes.

# Mandatory LocalDB & Delta Sync Architecture Rule for All New Modules (Instant 0ms Load & Zero Egress Policy)
- **Universal Application to All New Features & Data Grids**: Whenever any AI assistant or developer creates or adds a new module, page, tabular view, or entity management section in the CRM (e.g. Orders, Inventory, WMS, Recruitment, Reports, Masters):
  1. **Instant 0ms Client-Side Hydration (LocalDB / IndexedDB)**:
     - The module MUST NOT start with a blank screen or blocking server spinner.
     - It MUST implement client-side local caching (`IndexedDB` object store in `src/utils/offlineSync.js` or dedicated workspace cache, alongside fast web-storage snapshot).
     - On initial mount (`useEffect` / `useLayoutEffect`), data MUST hydrate immediately from LocalDB in **0ms**, allowing employees to view and interact instantly without waiting for network responses.
  2. **High-Efficiency Delta Sync (Differential Fetching)**:
     - Repeated full-table downloads are strictly prohibited for growing or frequently updated datasets.
     - The module MUST query only modified rows using `.gt('updated_at', lastSyncTimestamp)` or `.gt('created_at', lastSyncTimestamp)`.
     - Changes must be cleanly merged into the in-memory state and persisted to LocalDB via selective upserting (`upsert...Locally`).
  3. **Offline Store-and-Forward Queue Integration (`sync_queue`)**:
     - All user write actions (create, edit, delete, status toggle, submit) MUST gracefully handle offline state.
     - When disconnected, actions MUST safely enqueue to `sync_queue` in IndexedDB via `enqueueOfflineAction` with a Zero Data Loss guarantee.
     - When connectivity restores, actions MUST automatically flush via `flushOfflineSyncQueue`.
  4. **Multi-Tab & Cross-Device Sync Events**:
     - The module MUST listen to background sync events (e.g. `crm_trigger_delta_sync` or periodic timers) so multiple browser tabs stay synchronized automatically without page refresh.

# Strict Default-Deny (Zero Default Regular User Access) Rule for New Pages, Sub-Tabs & Modules
- **Default Deny for Regular Employees**: Under NO circumstances should any newly created Module, Page, Sub-Page, Sub-Tab, or Feature be granted default `view: true` access to regular employee roles (`telecaller`, `sales_executive`, `hr_recruiter`, `read_only_viewer`, etc.).
- **Admin-Only Initial Access**: All newly introduced modules and supervisory/tracking pages MUST be configured as **Admin-Only** (`master_admin` and `admin`) by default.
- **Explicit Opt-In via Permission Matrix**: Regular employees may ONLY receive access if and when an Admin explicitly checks their permission checkbox in the Role & Permission Matrix. Never hardcode automatic inheritance that exposes internal tracking, supervisor tools, or unassigned modules to normal staff.



