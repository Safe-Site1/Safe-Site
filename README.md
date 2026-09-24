# Safe-Site

## Customer project setup

Administrators open Administration to set their Company and Current Project / Site
name, or enter a New Project / Site Name and choose Add Project. Users select the
project in the header before completing forms; Work Area / Location is the specific
place within that project. Names are saved to that customer's organization in
Supabase, not just the browser. Rename keeps the same site UUID and report links.
New customer accounts start with My Organization / My First Project, with no
assumed geographic location. Existing customer projects are not renamed.

Apply `database/customer_projects.sql` (applied as `customer_project_management`).
The invoker RPC preserves RLS and restricts mutations to administrators, rejects
blank/duplicate active names, and uses one transaction for company/project changes.
The form does not change the account's role. `tests/customer-projects-database.sql`
checks 13 permission, persistence, retry and reference-preservation cases.

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

## Verified corrective-action closeout

Apply `database/corrective_action_closeout.sql` once before deploying the closeout
UI (applied as `verified_corrective_action_closeout`). Every close button opens the
same required-note workflow. Supabase assigns `closed_by` and `closed_at`; the
browser sends only the note and closed status. Existing descriptions/source links
are preserved. Closed records cannot be edited or reopened through updates.
Existing staff deletion permissions are unchanged.

Workers can still report/read actions from their own inspections, and Client Viewers
remain read-only. Legacy closed actions retain their original history and are
labeled as lacking a verified closer identity. Sorted/filtered lists and duplicate
titles use action IDs so they open the correct source and closeout record.

Staff create manual actions with the on-page **+ Add** form: required action,
description, priority and optional due date. Failed saves retain entries for retry;
Cancel, site changes and sign-out discard drafts. A successful save followed by a
list refresh failure is reported as saved, preventing an unnecessary second insert.

## Inspection, Incident and Near Miss reliability

Apply `database/field_submission.sql` before deploying `field-submissions.js`
(applied as `atomic_field_submissions`). The authenticated, SECURITY INVOKER RPC
saves an inspection and its deficiency action in one transaction, retaining RLS.
Pass inspections create no action; Out of Service creates a critical action.
Work Area is required; deficiencies require notes; incidents require location and
description. Incident and Near Miss retain distinct record types.

Each submission attempt has a UUID. Double clicks are ignored; an uncertain reply
locks the original entries for a retry with the same UUID and payload. Exact
replays return the existing record without creating another action. Database
rejections unlock entries for correction unless an earlier response was uncertain.
Pending requests are preserved in tab session storage before sending, scoped to
account, organization, site and form. After reloading, reopen the same form and
tap Submit to check or complete the original submission. Switching sites hides
the pending entries until that site is selected again; sign-out clears recovery
data from the tab. Closing the tab or clearing browser storage can lose recovery,
so check Recent Activity before re-entering an uncertain report in a new tab.
If session storage cannot preserve a request, nothing is sent. Successful saves followed
by refresh failures are explicitly reported as saved.

Photo evidence is attached from saved report details (open through Recent Activity
or Reports). Apply `database/record_photos.sql` first, applied as
`private_record_photo_evidence`. The private `record-photos` bucket accepts JPG,
PNG and WebP up to 10 MB. Storage policies require a visible field report and active
organization membership. Workers may attach to their own submitted reports; staff
may attach within their organization; Client Viewers read only. No overwrite or
delete policy is granted. A SHA-256 filename makes identical-file retries reuse
the same photo. A failed upload leaves the saved report intact; after reload,
reselect the same file to retry. Viewing generates a 60-second signed URL.
Legacy filename-only entries are explicitly labeled unverified and are unchanged.

`tests/record-photos-database.sql` checks private storage configuration and 16
authorization cases with rollback fixtures. The browser suite checks upload failure,
lost-response recovery, duplicate retries and viewing. File validation checks image
signatures, type and size; it is not malware scanning or a full image decoder.

`tests/field-submission-database.sql` runs 28 rollback assertions including a forced
action-insert failure, replay checks, organization boundaries and Client Viewer
read-only access. The five-role browser suite also tests all three field forms,
uncertain-response retries and Client Viewer screen restrictions.

## Automated checks

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

Corrective-action coverage: `tests/corrective-action-database.sql` runs 49 rollback
assertions for role restrictions, required notes, signature spoofing, immutable
closeout and stale updates. `node tests/corrective-action-browser.cjs` checks all
five roles, duplicate-title routing, required notes and failed-save retry. It uses
the same Playwright environment options described above.
