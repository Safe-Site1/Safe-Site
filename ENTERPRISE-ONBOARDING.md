# Enterprise Bulk Onboarding

Administrator and Safety Coordinator accounts can open **Workers → Enterprise Bulk Onboarding**. Administrators also have an entry under Administration.

1. Download the blank workbook. Fill Workers, Qualifications, Site Requirements and Document Index; retain the headers on empty optional sheets. Use existing site names. Preserve employee numbers as text and supply ISO dates or Excel date cells. Formulas and unknown columns are rejected instead of silently discarded.
2. Validate the workbook. The server stages and validates an isolated batch. Review counts, issues and staged rows. The issue summary is capped at 200 by the deployed RPC; the paginated row reviewer exposes every staged row and its errors/warnings.
3. Explicitly approve existing-record updates, then confirm the import. The server revalidates and commits all workforce/training/requirement rows in one transaction. If the preview changes during the pre-commit check, the UI requires another review.
4. Select certificate files whose unique filenames exactly match Document Index. Files upload to private `worker-documents` storage using organization/worker/batch paths and SHA-256 names, with `upsert:false`. Registration links each file through the deployed RPC. Missing/failed files remain visible and retryable. A lost upload response is recovered by verifying stored bytes; completed registrations are skipped.

Limits match the deployed API: 2,000 workers, 20,000 qualifications, 5,000 requirements and 20,000 documents per batch. The browser caps workbook files at 20 MB and individual documents at 10 MB. XLSX parsing runs in a Web Worker with a 60-second deadline. Network operations have a 90-second deadline and report uncertain outcomes rather than success. PDF, JPEG, PNG and WebP signatures/MIME types are checked. File signature checks are not antivirus scanning.

Use **Refresh / recover batch** after an interrupted request; the latest 100 organization batches are available, including after reload. Staging has no request-id parameter in the deployed API: a lost stage response can leave an isolated batch, so recover it before staging again. Document bytes must be reselected after reload; they are not persisted in browser storage. Record import and document uploads are separate transactions and their progress is explicitly distinguished. An upload that never registers can leave a private unlinked object; a retry with identical bytes reuses it. There is no automatic destructive cleanup.

The existing invitation form now accepts Employee Number for worker invitations. This lets acceptance attach the account to an imported passport even when the invitation display name differs. Optional worker email is preserved through imports. Non-worker roles ignore the employee number.

Workbook parsing uses vendored SheetJS CE 0.20.3 from its [official distribution](https://docs.sheetjs.com/docs/getting-started/installation/standalone/), with its license included. Vendor SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`.

## Validation

- `node --test tests/enterprise-onboarding.test.cjs tests/worker-flow.test.cjs`: parser, 500-worker workbook round trip, malformed dates/formulas, role guards, existing workflows, timeouts and secure upload recovery.
- `node tests/enterprise-onboarding-browser.cjs` (Playwright required; `BROWSER_EXECUTABLE` can select installed Chromium): real shipped UI and Web Worker at 390px and 1280px, using a mocked cloud transport. Tests explicit confirmation, XSS escaping, lost commit recovery, document registration retry and role denial.
- `tests/enterprise-onboarding-database.sql`: live PostgreSQL/RLS tests with 500 workers and 500 qualifications, explicit update confirmation, duplicate rejection, idempotent commits/registrations, document path/existence checks, role isolation and employee-number invitation linking. All fixtures roll back. Storage registration uses a synthetic metadata row; real object transfer is covered by mocked upload tests, not a production Storage upload.
- Existing `tests/pre-shift-browser.cjs` and `tests/corrective-action-browser.cjs`: passed across all five roles.

The agent-browser CLI could not establish its browser connection on this Windows host; visual verification used Playwright with installed Edge and inspected screenshots. The frontend is prepared as a review branch, not deployed. The invitation database fix is live and was retested after application. Supabase advisors still report existing public QR lookup/invitation SECURITY DEFINER warnings and disabled leaked-password protection; no new onboarding advisory appeared. See [function exposure guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
