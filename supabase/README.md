# Safe Site migration history

The migration files through `20260924203619` were exported verbatim from the live Safe Site project's `supabase_migrations.schema_migrations` statement arrays on September 24, 2026. Their original versions, names and order are preserved. This includes the historical baseline, today's field-record integrity fixes, enterprise onboarding, bulk validation/staging optimizations, and employee-number/email identity support.

`20260924222146_fix_enterprise_invitation_conflict.sql` is a tested follow-up applied during this implementation. The identity-linking migration reintroduced an ambiguous `organization_id` reference in invitation acceptance. The follow-up uses the existing named uniqueness constraint and preserves the rest of the deployed function. The local migration was created with the Supabase CLI, then renamed to match the version recorded by the live migration API.

These migrations are already applied to the live project. Do not paste or replay them into production. Use the recorded versions when linking a checkout. The older `database/*.sql` files remain historical feature references; do not apply them again after this migration history.

The complete history has not been replayed into a fresh local Supabase stack during this task. Runtime tests ran against the live schema using synthetic fixtures inside transactions that end with ROLLBACK. No real workforce records or storage files were used.
