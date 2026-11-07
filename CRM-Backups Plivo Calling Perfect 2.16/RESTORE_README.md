# CRM Softphone v2.16 Golden Backup

This snapshot preserves the current approved on-disk Softphone v2.16 implementation, including the icon-only docked launcher and effect/lint fixes. It also captures related calling sources, tests, audio, and shared files for reference. It is not a full CRM, database, deployment, or credential backup.

## Snapshot and protection

- Creation time, exact file list, and versions are recorded in `BACKUP_MANIFEST.json`.
- Time zone: Asia/Kolkata / UTC+05:30. ZIP entry times also use IST.
- Softphone: v2.16. Main CRM package: 2.5.1089 (reference only).
- Files are stored under `source/` inside `CRM-Softphone-v2.16.zip`.
- This is the current disk snapshot, including approved and pre-existing uncommitted workspace changes; it is not merely a copy of the last Git commit.
- This folder and all artifacts are permanent golden backup material. Never delete, overwrite, regenerate in place, or modify them. Create a separately named snapshot for future approved work.
- All historical v2.1, v2.5, v2.9, and v2.14 golden backups remain protected.

## Recorded validation

- Focused Softphone widget/contact/incoming/recovery checks: 65 passed, 0 failed.
- Targeted lint of the widget and effects test: 0 errors, 0 warnings.
- Broader Softphone/Plivo/Call Admin/Desk run: 228 total, 213 passed, 15 failed in existing Call Admin/Desk tests. The failures include missing test fixture dependencies and pagination expectations. These are captured without changing runtime code to fix them.
- `verification.log` contains both commands and complete outputs. This snapshot does not imply every Call Center test passes or that a real carrier call was placed.
- Source-byte integrity and historical backup checks were verified during capture; see `BACKUP_MANIFEST.json`.

## Verify before any restoration

1. Read `AGENTS.md` and obtain approval for the exact restoration plan before changing runtime files.
2. Use `Get-FileHash -Algorithm SHA256 -LiteralPath '<absolute artifact path>'` to compare the ZIP, manifest, guide, and verification log against `CHECKSUMS.sha256`.
3. Open the ZIP read-only and compare its entry names and each entry's SHA-256 to `BACKUP_MANIFEST.json`. Every `source_path` maps to the listed `archive_path`. Do not extract into the live workspace just to inspect it.
4. If extraction is necessary, choose a new, empty inspection directory outside every protected golden backup and outside the live source tree. Never overwrite an existing directory or artifact.
5. Compare the current source with the archived source. Present exact files/functions to restore and the effect on running employees before making any code change.

## Scoped restoration

- Restore only the files or calling functions required by the user-approved plan. Keep a separate, new pre-restoration snapshot of the affected current files; never modify this snapshot.
- `protected_softphone_source` and `protected_telephony_audio` entries identify the dedicated baseline. Even these must be reviewed and restored only within the approved scope.
- Call Center context, telephony routes/helpers, and shared telephony sources have other dependencies; review their diffs and current caller contracts before restoring them.
- `workspace_reference_only` entries include shared `team.js`, permissions, the CRM container, components, package/config files, and the recorded root `AGENTS.md`. Never bulk-copy these files over a newer workspace. Restore only explicitly approved Softphone sections where appropriate.
- Schema files are reference only. Do not run, roll back, overwrite, or change database migrations/data as part of a source restoration.
- Do not reset the main CRM package version or lockfile to the reference copy. This documentation/backup operation did not increment either runtime version.
- Environment files, live credentials, database records, provider configuration, `node_modules`, and build caches are deliberately outside this snapshot. Keep the current tenant authentication, credentials, BYOC configuration, and live call sessions intact.
- Preserve incoming-call guards, consultation isolation/concurrency, caller ID, tenant boundaries, duration/ringtone behavior, contact lookup, routing, and registration recovery.

## Validate after an approved restoration

Run the focused checks and targeted lint commands recorded in `verification.log`, then all broader suites relevant to the restoration. The recorded 15 broader failures are known limitations; do not describe them as a clean test baseline. Verify affected controls in the browser and perform an authorized carrier test where calling behavior requires it. Keep existing employee operations available; do not delete caches or restart active servers as an incidental cleanup step.

There is no automatic restore script because bulk replacement could overwrite unrelated CRM work. This guide records a verification and scoped restoration procedure only.
