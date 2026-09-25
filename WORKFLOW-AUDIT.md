# Central workflow audit

Applied live September 25, 2026, as migration `20260925130837_audit_safety_workflow_events.sql`.

The rehearsal exposed that approval/closeout signatures existed on source records without central audit events. Database AFTER triggers now append events in the same transaction as safety-record creation/status changes and corrective-action creation/status changes/closeout. Audit failure aborts the source write.

Events use the reserved `workflow.` action prefix and record the authenticated actor, organization, source ID, site, server timestamp and status transition. Approval metadata retains the approver/time; closeout metadata retains the closer/time, note and source inspection link. Full report payloads and attachments are not copied.

The functions use SECURITY INVOKER in the private schema, with direct execution revoked. Existing audit RLS remains: administrators and safety coordinators can read their organization's events. Workers and foreign administrators cannot read them. Direct client insertion of reserved workflow events is rejected. Workflow events cannot be altered or deleted through normal application roles; unchanged status and stale conditional retries do not produce events.

## History boundary

Only future events are captured. Earlier rehearsal records retain their source-level signatures and notes, but no historical events are fabricated or backdated. This change does not add an audit viewer or audit unrelated workflows such as training edits and account administration.

Privileged maintenance must deliberately account for immutable workflow audit rows, including account/organization removal that would otherwise cascade into audit history.

## Verification

All tests use synthetic fixtures and roll back:

- `tests/workflow-audit-database.sql`: 16 checks; six lifecycle events, authenticated actor attribution, source links, signature metadata, duplicate prevention, forged-event rejection, audit-failure rollback, immutability and tenant/role isolation.
- `tests/pre-shift-database.sql`: 57 existing checks passed with the migration.
- `tests/risk-assessment-database.sql`: 69 existing checks passed with the migration.
- `tests/field-submission-database.sql`: 28 existing checks passed with the migration.

Total: **170 checks**. The 16 new checks also passed again after live application. No real safety records were created or modified by these tests.

Security advisors introduced no new notices. Existing function-exposure and disabled leaked-password-protection notices remain; see [function exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
