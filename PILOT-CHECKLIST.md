# Pilot verification — September 23, 2026

## Verified

- Pre-Shift: current cloud templates, required Work Area, pending review, authenticated staff approval and immutable submitted content. Live Worker-to-Supervisor pilot completed.
- Pre-Task Risk Assessment: cloud templates and site threshold, required Work Area, pending review and authenticated approval. Live labeled pilot completed.
- Corrective actions: exact record routing with duplicate titles, required closeout note and server-assigned closer/time. Live labeled closeout completed.
- Manual actions: on-page form, validation, role restrictions and failed-save recovery. Live labeled creation completed; that test action remains open.
- Inspection submission: database transaction includes the linked deficiency action. Forced action failure rolls back the inspection; identical retries do not duplicate it. Work Area and authenticated creator preserved.
- Incident/Near Miss: distinct record types, required location/description, duplicate-click and uncertain-response protection.
- Live Supervisor checks: inspection `928f8135-4a9f-4e21-9d70-b8c5031132a7` saved with exactly one linked action; Incident `12f50dc5-8285-4dad-b60f-5f32e2759e8f` and Near Miss `f9d00294-129a-4a1b-8a26-176a435f48c1` saved separately. All three retain the authenticated creator and submitted status. The synthetic inspection action remains open.
- Reports display the actual saved status rather than labeling all field records Completed.
- Reload recovery: uncertain field submissions restore original entries and reuse their submission ID after a same-tab reload. Account/site isolation, blocked storage, sign-out cleanup and later permission failures are tested. Browser tests simulate a committed save with a lost response, reload the page and verify one record after retry.
- Worker isolation and Client Viewer read-only report access: real database rollback fixtures plus shipped-page browser tests. Tests use mocked cloud transport in the browser; database permission checks use real RLS separately.

## Remaining before expanding the pilot

- Photo evidence: private uploads and viewing from saved field reports are implemented; role restrictions, size/type validation and safe duplicate retries are tested. Historical filename values remain unverified. Test device-specific camera formats (HEIC is not supported), mobile upload behavior and retention requirements before broad rollout.
- Recovery after closing the tab, clearing storage or signing out: tab recovery data is no longer available. Check Recent Activity before re-entering an uncertain submission. Cross-device/offline queue recovery remains future work.
- Existing Supabase security advisories: review intentional public worker-pass lookup functions, authenticated privileged invitation/team functions, and leaked-password protection. No new advisory was introduced by the field-submission RPC.
- Staff safety-record editing/deletion permissions outside the verified approval/closeout workflows need a separate audit-retention decision. The new RPC does not change existing table permissions or prevent all legacy/direct API writes.
- Test real photo workflows when implemented, extended offline recovery, and supported mobile devices before relying on the app in field operations.

All live verification records are labeled PILOT TEST ONLY. They do not certify an equipment defect, completed repair, or authorization to perform field work.
