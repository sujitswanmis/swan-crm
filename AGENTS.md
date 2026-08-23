<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workspace Deployment Rules
- **Version Bump**: Always bump the version in `package.json` with every update/release.
- **Verification First**: Always run `npm run build` or local check commands to verify correctness before committing.
- **No Automatic Pushes**: Do NOT execute `git push` automatically. Always present changes to the user first, allow them to verify locally, and wait for their explicit permission before pushing changes.

