# Pilot verification — September 23, 2026

## Verified

- Pre-Shift: current cloud templates, required Work Area, pending review, authenticated staff approval and immutable submitted content. Live Worker-to-Supervisor pilot completed.
- Pre-Task Risk Assessment: cloud templates and site threshold, required Work Area, pending review and authenticated approval. Live labeled pilot completed.
- Corrective actions: exact record routing with duplicate titles, required closeout note and server-assigned closer/time. Live labeled closeout completed.
- Manual actions: on-page form, validation, role restrictions and failed-save recovery. Live labeled creation completed; that test action remains open.
- Inspection submission: database transaction includes the linked deficiency action. Forced action failure rolls back the inspection; identical retries do not duplicate it. Work Area and authenticated creator preserved.
- Incident/Near Miss: distinct record types, required location/description, duplicate-click and uncertain-response protection.
- Worker isolation and Client Viewer read-only report access: real database rollback fixtures plus shipped-page browser tests. Tests use mocked cloud transport in the browser; database permission checks use real RLS separately.

## Remaining before expanding the pilot

- Photo evidence: actual file upload/storage and permission testing are still needed. Field forms now state that uploads are unavailable; historical filename values do not prove evidence was uploaded.
- Recovery across reloads: pending field submission IDs currently live in the page. Retry uncertain submissions without reloading. If the page was reloaded, check Recent Activity before re-entering a report.
- Existing Supabase security advisories: review intentional public worker-pass lookup functions, authenticated privileged invitation/team functions, and leaked-password protection. No new advisory was introduced by the field-submission RPC.
- Staff safety-record editing/deletion permissions outside the verified approval/closeout workflows need a separate audit-retention decision. The new RPC does not change existing table permissions or prevent all legacy/direct API writes.
- Test real photo workflows when implemented, offline/network recovery across reloads, and supported mobile devices before relying on the app in field operations.

All live verification records are labeled PILOT TEST ONLY. They do not certify an equipment defect, completed repair, or authorization to perform field work.
