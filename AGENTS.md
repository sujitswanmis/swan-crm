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

# Mandatory Independent Softphone & CRM Version Increment Rules
- **CRM Softphone Version**: For every completed CRM Softphone update (UI, calling behavior, or related calling fixes), increment the final numeric component of `SOFTPHONE_VERSION` in `src/components/CallCenter/GlobalSoftphoneWidget.jsx` by exactly **+1**, once for that completed update. Example: `v2.1` -> `v2.2` -> `v2.3`.
- **SuPuja Creations CRM Version**: For every completed main CRM update, increment only the final numeric component of `version` in `package.json` by exactly **+1**, once for that completed update. Example: `1.0.847` -> `1.0.848` -> `1.0.849`. The CRM display must continue to use this package version as its source of truth.
- **Independent Counters**: Track the softphone and main CRM versions separately. Increment each affected product's counter once; if the same completed update changes both products, increment both counters once. Do not increment again for intermediate edits, repeated checks, retries, restarts, or publishing the same already-versioned update.
- **Read Current Values Before Every Bump**: Immediately before a version change, read the relevant current on-disk version source and inspect `git log -n 1`. Follow the existing realtime verification rule; never use an example or an old chat message as the current value, and never downgrade or reset a version.
- **Last Component Is an Integer**: Keep all preceding version components unchanged. Do not treat a version as a decimal number or automatically roll it into another series: `v2.9` -> `v2.10`, and `1.0.999` -> `1.0.1000`.
- **Preserve Calling Protection**: References to `v2.1`, `v2.5`, `v2.9`, and `v2.14` in the calling architecture protection rules and the golden backups (`CRM-Backups Plivo Calling Perfect 2.1/`, `CRM-Backups Plivo Calling Perfect 2.5/`, `CRM-Backups Plivo Calling Perfect 2.9/`, and `CRM-Backups Plivo Calling Perfect 2.14/`) identify the permanently protected working baselines. The current `v2.14` is strictly fixed by the user-confirmed baseline rule below. Any future version or modification requires an explicit direct instruction from the user for a Softphone change and prior approved plan, and must preserve the existing safeguards and all golden backups.
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

# Mandatory Standard Table Pagination & Sticky Header Rule (Unified Table Setup)
- **Universal Application Across All CRM Tables**: The standard page navigation setup and frozen header structure MUST be applied uniformly across every tabular view in the CRM (Daily Order Followup tabs, Pipeline, Feedback, Complaints, Users, Party Master, Leads, etc.):
  1. **Frozen Table Header (`position: sticky`)**:
     - All table headers (`<thead>` and `<th>`) must be sticky (`position: sticky; top: 0; zIndex: 10; backgroundColor: 'var(--bg-surface)'`) with `boxShadow: 'inset 0 -1px 0 var(--border-light)'`.
     - The table wrapper must have a bounded scrollable height (`overflow: 'auto'`, e.g., `maxHeight: 'calc(100vh - 310px)'`, `minHeight: '380px'`) so headers remain frozen during scrolling.
     - Column resizing (`ColumnResizer`) must remain fully integrated and active on every frozen header.
  2. **Unified Bottom Page Navigation (Navigation Bar Setup)**:
     - **Record Counter**: Display exact range on left: `Showing <strong>{from}</strong> to <strong>{to}</strong> of <strong>{total}</strong> records`.
     - **Rows Per Page Selector**: Standard dropdown selector with options `[10, 25, 50, 100]`, with default set to **25** records.
     - **Standard 5-Button Navigation Controls**:
       - First Page (`<<` / `ChevronsLeft`)
       - Previous Page (`<` / `ChevronLeft`)
       - Current Page Indicator (`Page {currentPage} of {totalPages}`)
       - Next Page (`>` / `ChevronRight`)
       - Last Page (`>>` / `ChevronsRight`)
       - Boundary disabled states (disabled when on first/last page).
     - **Automatic Page Reset**: Whenever the user types in search, changes tab/filter, switches period/date, or updates rows per page, `currentPage` MUST automatically reset to `1`.

# Mandatory Table Column Resizing Rule (Lead Data Pattern)
- **Interactive Column Resizing Across All Tables**: Every tabular data grid / table across the CRM (whether using TanStack Table or standard HTML `<table>`) MUST provide interactive column resizing capability on each column header (`<th>`), allowing users to expand or shrink column widths (`chhota bada krna`), exactly as implemented in Lead Data (`LeadTable.jsx`).
- **Standard Resizer Requirements**:
  1. **Visual Draggable Handle**: A dedicated vertical divider handle on the right edge of each header (`cursor: col-resize`, `user-select: none`, `touch-action: none`).
  2. **Active Drag Feedback**: The resizer bar must visibly highlight (e.g. `var(--accent-color, #2563eb)`) while actively dragging.
  3. **Reset on Double-Click**: Double-clicking the resizer handle resets that column back to its default width.
  4. **Persistence & Safe Constraints**: Enforce sensible minimum widths (`minWidth`, e.g. 60px–110px) to prevent column collapse, and persist user-adjusted column widths in `localStorage` so settings survive page navigation and refresh.

# User-Confirmed Fixed CRM Softphone v2.14 Baseline & Restoration Rules
- **Fixed Working Version**: The user has confirmed CRM Softphone `v2.14` is working perfectly. Treat this exact implementation as the permanently fixed, approved baseline. Any AI assistant or developer MUST NEVER change its UI, calling behavior, contact lookup, caller ID handling, duration formatting, ringtone audio, routing controls, registration recovery, Endpoint ID display, startup/loading behavior, cache behavior, or version unless the user explicitly requests a Softphone change and approves its implementation plan.
- **No Incidental or Silent Softphone Changes**: General CRM fixes, refactors, performance work, dependency updates, and changes to other modules (leads table, attendance, auth, etc.) do NOT authorize any Softphone changes. Preserve the behavior of `src/components/CallCenter/GlobalSoftphoneWidget.jsx`, `ActiveCallPanel.jsx`, `useSoftphoneContacts.js`, `Softphone.module.css`, the Softphone-related functions in `src/app/actions/team.js`, and all Plivo calling routes and helpers. Keep all unrelated work strictly isolated from this protected behavior.
- **Restoration Protocol & Golden Backup**: In the event that any calling issue, regression, or accidental change ever occurs, CRM Softphone `v2.14` can and must be restored directly from the permanent golden backup in `CRM-Backups Plivo Calling Perfect 2.14/` following the procedure in `RESTORE_README.md`.
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


