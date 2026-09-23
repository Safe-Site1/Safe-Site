# Safe-Site

## Pre-shift supervisor review

Workers select an active cloud task, complete the work area, hazards and controls,
and submit **Pending Supervisor Review**. There is no typed supervisor sign-off.
Supervisors, administrators and safety coordinators open a Pre-Shift in Reports
(or Recent Activity), review it, then choose **Approve & Sign as My Account**.
Client Viewers remain read-only; Workers cannot access Reports or approve records.

Supabase checks active organization membership on each approval. The database
sets `status = approved`, `approved_by` (the authenticated account UUID), and
`approved_at` (server time). Client-supplied identities/timestamps are rejected.
Submitted content and signed records are immutable; corrections require a new
submission. Concurrent/stale approvals cannot overwrite a signature.

Apply `database/pre_shift_approval.sql` once via Supabase migrations before
deploying this frontend. It was applied to the Safe Site project as
`enforce_pre_shift_supervisor_approval`. Existing RLS policies are preserved.
Legacy pre-shifts become pending, with typed supervisor text retained in
`data.legacy_unverified_supervisor`, never treated as a signature. Legacy records
without a Work Area must be completed as new submissions before approval.

## Tests

- `node --test tests/worker-flow.test.cjs`: form validation, cloud template loading,
  roles, status display, failures and conditional approval updates.
- Run `tests/pre-shift-database.sql` as postgres in the Supabase SQL editor after
  applying the schema change. It uses isolated fixtures and rolls back everything;
  57 assertions exercise real RLS/trigger behavior for all five roles, foreign and
  inactive staff, forged signatures, immutable content and stale approvals.
- With Playwright available, run `node tests/pre-shift-browser.cjs`. It loads all
  shipped scripts in a headless browser and exercises five role flows against a
  mocked cloud transport. Set `BROWSER_EXECUTABLE` for an existing Chrome/Edge
  executable and optionally `SCREENSHOT_DIR` for a review screenshot.

The browser transport is mocked; database authorization is separately tested on
Supabase using the rollback suite above.
