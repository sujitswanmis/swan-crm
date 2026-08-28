<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workspace Deployment Rules
- **Strict Realtime Version Verification**: NEVER guess, remember, or assume the version number from previous chat history. ALWAYS read the current on-disk `package.json` file using `view_file` AND check `git log -n 1` right before bumping. Always increment strictly by +1 from the CURRENT disk/git version (e.g. if current disk is `1.0.370`, the next version MUST be `1.0.371`). NEVER downgrade, overwrite, or use an older version series.
- **Verification First**: Always run `npm run build` or local check commands to verify correctness before committing.
- **No Automatic Pushes**: Do NOT execute `git push` automatically. Always present changes to the user first, allow them to verify locally, and wait for their explicit permission before pushing changes.
