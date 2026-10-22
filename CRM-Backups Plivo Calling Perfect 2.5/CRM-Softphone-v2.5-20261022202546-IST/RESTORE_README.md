# CRM Softphone v2.5 Golden Backup Baseline
**Protected Version**: CRM Softphone `v2.5`
**Created At**: 2026-10-22T20:25:46.717Z (IST)
**Test Suite**: 67 Passing Automated Tests

## Protected Architecture Highlights:
1. **Dynamic Dialing Toggle**: Browser WebRTC vs Via Mobile (`CallingMethodToggle`).
2. **Tenant-Isolated Telephony & BYOC Auth**: Multi-tenant resolution with token wipe safeguards.
3. **Cloudflare Tunnel & Public Webhook Guard**: `isPrivateOrLocalHost` prevents private IP leakage.
4. **State Freeze Recovery & Dial Error Transparency**: Outbound failure cleanup & permanent Supabase logging.
5. **Zero Duplicate UI Cards**: Exclusive rendering between `ActiveCallPanel.jsx` and `GlobalSoftphoneWidget.jsx`.
6. **Realtime Leg Inspection**: 1-second Plivo SDK polling (`client.calls.get`).
7. **Universal Dual-Language Voice Engine**: Hindi + English TTS with system voice fallback.
8. **Attended Consultation**: Multi-Party Conference, hold audio tone, atomic cancel & merge.
9. **Inbound Call Guard**: `createIncomingCallGuard` prevents SDK double-answer race conditions.
10. **Authoritative Indian Telecom Outcome Mapping**: Comprehensive Q.850 & SIP code diagnostic categorization.

## Restoration:
To restore any corrupted softphone component, copy the required files from `source/` back to the repository root.
