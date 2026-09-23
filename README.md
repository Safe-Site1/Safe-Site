# Safe-Site

## Pre-shift and risk assessment supervisor review

Workers select an active cloud task, complete the work area, hazards and controls,
and submit **Pending Supervisor Review**. There is no typed supervisor sign-off.
Supervisors, administrators and safety coordinators open the record in Reports
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

Apply `database/risk_assessment_approval.sql` after the pre-shift migration. It was
applied as `enforce_risk_assessment_supervisor_approval`. Risk assessments use the
same pending/approved state and authenticated signature fields. The four legacy
risk assessments were marked pending; their typed names and AI history remain
under explicitly unverified legacy fields.

Risk assessments require numeric likelihood/severity ratings from 1 through 5.
Supabase calculates the scores itself and enforces `sites.risk_stop_work_threshold`
on both submission and approval. Its default of 10 preserves the previous pilot
threshold; only administrators can change site settings under existing RLS.
The UI loads this threshold from Supabase rather than browser-local configuration.
Review the site's risk criteria before real-world use. Legacy records with missing
areas, invalid scores or risk above the current threshold need a new submission.

AI checkboxes record preparer draft checks, not supervisor approval. AI audit events
now say `ai_risk_assessment_submitted`. Failed saves retain the draft/checklist for
retry; changing tasks/sites or signing out clears the draft. Historical audit events
are preserved and do not establish approval; only the verified safety-record fields
above do so.

## Tests

- `node --test tests/worker-flow.test.cjs`: form validation, cloud template loading,
  roles, status display, failures and conditional approval updates.
- Run `tests/pre-shift-database.sql` as postgres in the Supabase SQL editor after
  applying the schema change. It uses isolated fixtures and rolls back everything;
  57 assertions exercise real RLS/trigger behavior for all five roles, foreign and
  inactive staff, forged signatures, immutable content and stale approvals.
- `tests/risk-assessment-database.sql` runs 69 equivalent assertions plus score,
  threshold, AI-metadata and site-permission bypass checks, also fully rolled back.
- With Playwright available, run `node tests/pre-shift-browser.cjs`. It loads all
  shipped scripts in a headless browser and exercises ten role/workflow flows against a
  mocked cloud transport. Set `BROWSER_EXECUTABLE` for an existing Chrome/Edge
  executable and optionally `SCREENSHOT_DIR` for a review screenshot. Risk flows
  also verify the stop-work button state, AI checklist and retry after a failed save.

The browser transport is mocked; database authorization is separately tested on
Supabase using the rollback suite above.
