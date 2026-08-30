<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workspace Deployment Rules
- **Strict Realtime Version Verification**: NEVER guess, remember, or assume the version number from previous chat history. ALWAYS read the current on-disk `package.json` file using `view_file` AND check `git log -n 1` right before bumping. Always increment strictly by +1 from the CURRENT disk/git version (e.g. if current disk is `1.0.370`, the next version MUST be `1.0.371`). NEVER downgrade, overwrite, or use an older version series.
- **Verification First**: Always run `npm run build` or local check commands to verify correctness before committing.
- **No Automatic Pushes**: Do NOT execute `git push` automatically. Always present changes to the user first, allow them to verify locally, and wait for their explicit permission before pushing changes.

# Production Workflow Protection & Zero-Regression Rules
- **Zero Impact on Existing Live Modules**: Active employees continuously work on live modules (Lead Management / Lead Table, Call Center / Softphone, Attendance, User Sessions, Master Records). Any new feature implementation (e.g., Smart Checklist, Delegation, AI Admin, etc.) must NEVER break, slow down, or block these ongoing processes.
- **Strict Isolation & Decoupling**: Keep new modules and components completely decoupled. Never introduce breaking changes to shared state, global contexts, layout wrappers, or shared utilities that core operational modules rely on.
- **Backward Compatibility for Shared Code**: When modifying shared server actions, utilities, or database query helpers, always maintain backward compatibility. Never remove, rename, or mutate parameters or return formats that existing production modules depend upon.
- **Defensive Error Handling & Graceful Fallbacks**: Wrap new components, background hooks, and async server actions in try-catch blocks and error boundaries. If a new or secondary feature encounters an error or network lag, it must fail silently or gracefully without crashing the app, freezing the UI, or blocking other tabs.
- **Non-Blocking Execution & Safe Caching**: Avoid heavy synchronous operations or unthrottled polling loops in new features that could block the main UI thread, exhaust network limits, or invalidate active lead/call caches.
- **Additive Database Changes Only**: When introducing schema or database updates for new features, only use non-destructive, additive changes (e.g., optional columns with safe defaults or dedicated tables). Never alter, rename, or drop active columns used by live processes.
