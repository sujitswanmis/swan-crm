# CRM Softphone v2.9 Golden Backup Restoration Guide

**Snapshot Version**: CRM Softphone `v2.9` (CRM Build `1.0.863`)  
**Created At (IST)**: 2026-10-23T20:54:10.641Z  
**Preserved Files**: 55  
**Passing Automated Tests**: 124 / 124  

---

## 🛡️ Preservation Notice
This golden backup encapsulates the complete, battle-tested, verified baseline for **CRM Softphone v2.9**.
Under the instructions in `AGENTS.md`, this backup is a permanent, non-deletable golden archive.

---

## 🔄 Restoration Protocol

If any regression, accidental modification, or provider integration issue occurs in CRM Softphone, follow these exact steps to restore `v2.9`:

### Automatic Restoration (PowerShell):
```powershell
Set-Location 'E:\swan hosting'
$BackupSource = 'E:\swan hosting\CRM-Backups Plivo Calling Perfect 2.9\CRM-Softphone-v2.9-20261023205410-IST\source'
Copy-Item -Path "$BackupSource\*" -Destination 'E:\swan hosting' -Recurse -Force
```

### Verification after Restore:
```powershell
# 1. Run all test suites
node tests/plivo-consultation.test.mjs
node tests/softphone-incoming-call.test.mjs
node tests/plivo-outcomes.test.mjs
node tests/plivo-start-call.test.mjs
node tests/plivo-outbound-dial.test.mjs
node tests/call-admin-agents.test.mjs
node tests/softphone-contact-lookup.test.mjs

# 2. Check checksums
# Ensure hashes match CHECKSUMS.sha256

# 3. Verify Next.js Production Build
npm run build
```
