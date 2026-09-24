# Worker invitation recovery verification

Verified September 24, 2026, against main release `3f8723e`.

## Fixed

If invitation acceptance committed but its response was lost, the browser retained the invitation token. The next sign-in retried acceptance, which failed with "Invitation is no longer active" and prevented tenant loading.

Migration `20260924235005_recover_accepted_invitation_retry.sql` makes an accepted invitation a read-only receipt for the same authenticated user and invited email. It returns the original result only while the same organization role and site membership remain present. It does not recreate memberships, restore access, relink workers, or modify the original acceptance timestamp. Pending, revoked and expired invitation behavior remains unchanged.

The migration is applied live and its filename matches Supabase migration history.

## Evidence

- 64 JavaScript tests passed, including browser-side recovery after an accepted invitation response is lost.
- 39 database assertions passed on the live schema, using synthetic records inside a transaction that rolls back.
- The database scenario stages and commits 500 workers and 500 qualifications, verifies explicit update confirmation, and rejects invalid partial imports.
- Employee-number acceptance attaches the correct existing passport despite a different display name.
- The worker can read only their own passport and training, can read their certificate metadata, and can read site requirements.
- Another account cannot reuse an accepted invitation even with the same email claim.
- Changed email and revoked membership block retry; revoked access remains inactive.
- The final 500-worker database workflow took approximately 7.8 seconds.

No real worker was invited or imported. Email delivery, confirmation links in a real mailbox, and sign-in as a separate real worker account have not been tested in this pass. Certificate metadata access was tested; this pass did not transfer real certificate bytes through Storage.

Supabase advisors reported the existing intentional invitation/QR function exposure notices and disabled leaked-password protection, with no newly introduced advisory. See [function exposure guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Repeat

Run `node --test tests/worker-flow.test.cjs tests/enterprise-onboarding.test.cjs`, then run `tests/enterprise-onboarding-database.sql` against the migrated database. The SQL script ends with `ROLLBACK`.
