# Enterprise onboarding change inventory

Base: `a70496d` (latest main verified September 24, 2026).

Validation: 63 JavaScript tests, mobile/desktop onboarding browser scenarios, 15 existing role/workflow browser scenarios, and 30 rollback database assertions passed. The 500-worker / 500-qualification database workflow took approximately 8 seconds on the final run. All 54 exported historical migrations match the live statement history, ignoring line endings and trailing blank lines. One additional invitation fix migration is live.

Exact files in this change:

- `.gitignore`
- `ENTERPRISE-CHANGESET.md`
- `ENTERPRISE-ONBOARDING.md`
- `enterprise-onboarding-core.js`
- `enterprise-onboarding-worker.js`
- `enterprise-onboarding.js`
- `index.html`
- `role-access-v4.js`
- `service-worker.js`
- `supabase/README.md`
- `supabase/migrations/20260909194213_safe_site_core_v1.sql`
- `supabase/migrations/20260909194223_lock_down_rls_helpers.sql`
- `supabase/migrations/20260909194905_safe_site_auth_onboarding_v1.sql`
- `supabase/migrations/20260909200919_move_rls_helpers_private.sql`
- `supabase/migrations/20260910011131_add_team_invitations.sql`
- `supabase/migrations/20260910011208_add_team_member_listing.sql`
- `supabase/migrations/20260910011828_grant_team_invitation_read_to_authenticated.sql`
- `supabase/migrations/20260910013712_fix_accept_team_invitation_ambiguous_organization_id.sql`
- `supabase/migrations/20260910022952_pilot_secure_worker_documents.sql`
- `supabase/migrations/20260910023512_pilot_qr_worker_passes_and_document_permissions.sql`
- `supabase/migrations/20260910030606_worker_pass_expiry_intelligence.sql`
- `supabase/migrations/20260911014034_add_qualification_requirements_and_worker_pass_compliance_v2.sql`
- `supabase/migrations/20260911020228_link_worker_accounts_for_secure_self_access.sql`
- `supabase/migrations/20260911020342_restrict_worker_private_records_to_self.sql`
- `supabase/migrations/20260911175928_add_jurisdiction_and_mining_context.sql`
- `supabase/migrations/20260911180130_add_canada_us_jurisdictions.sql`
- `supabase/migrations/20260911180441_secure_qualification_requirements_admin.sql`
- `supabase/migrations/20260911193134_grant_qualification_requirements_authenticated_crud.sql`
- `supabase/migrations/20260913000146_tighten_safety_record_role_access.sql`
- `supabase/migrations/20260913181644_harden_role_based_rls_v1.sql`
- `supabase/migrations/20260913181857_harden_invitation_acceptance_bootstrap_cleanup.sql`
- `supabase/migrations/20260913182102_add_security_lookup_indexes.sql`
- `supabase/migrations/20260913182151_restrict_team_rpc_execution.sql`
- `supabase/migrations/20260913182327_bind_audit_rows_to_authenticated_user.sql`
- `supabase/migrations/20260913182456_optimize_auth_rls_uid_checks.sql`
- `supabase/migrations/20260913182510_add_foreign_key_supporting_indexes.sql`
- `supabase/migrations/20260913182657_split_manage_rls_policies_by_operation.sql`
- `supabase/migrations/20260913182726_consolidate_insert_rls_policies.sql`
- `supabase/migrations/20260921003618_allow_client_viewer_read_qualifications.sql`
- `supabase/migrations/20260921004705_harden_org_bootstrap_and_invitation_rpcs.sql`
- `supabase/migrations/20260921004857_harden_public_worker_pass_privacy.sql`
- `supabase/migrations/20260922222550_auto_link_worker_on_team_invite_acceptance.sql`
- `supabase/migrations/20260923001045_allow_worker_corrective_action_for_own_inspection.sql`
- `supabase/migrations/20260923002510_enforce_pre_shift_supervisor_approval.sql`
- `supabase/migrations/20260923010058_enforce_risk_assessment_supervisor_approval.sql`
- `supabase/migrations/20260923011717_verified_corrective_action_closeout.sql`
- `supabase/migrations/20260923013836_atomic_field_submissions.sql`
- `supabase/migrations/20260923020446_private_record_photo_evidence.sql`
- `supabase/migrations/20260924175626_customer_project_management.sql`
- `supabase/migrations/20260924181927_history_preserving_cloud_task_editor.sql`
- `supabase/migrations/20260924185209_enforce_field_record_integrity_and_immutability.sql`
- `supabase/migrations/20260924185340_reset_field_submission_guard_after_insert.sql`
- `supabase/migrations/20260924201026_enterprise_onboarding_schema.sql`
- `supabase/migrations/20260924201041_enterprise_onboarding_preview.sql`
- `supabase/migrations/20260924201143_enterprise_onboarding_validation.sql`
- `supabase/migrations/20260924201202_enterprise_onboarding_stage.sql`
- `supabase/migrations/20260924201226_enterprise_onboarding_commit.sql`
- `supabase/migrations/20260924201246_enterprise_onboarding_documents.sql`
- `supabase/migrations/20260924202121_optimize_enterprise_onboarding_qualification_validation.sql`
- `supabase/migrations/20260924202205_fix_enterprise_onboarding_validation_name_conflict.sql`
- `supabase/migrations/20260924202409_optimize_enterprise_onboarding_staging.sql`
- `supabase/migrations/20260924202701_enterprise_onboarding_private_bulk_impl.sql`
- `supabase/migrations/20260924203543_enterprise_worker_identity_linking.sql`
- `supabase/migrations/20260924203619_enterprise_onboarding_worker_email.sql`
- `supabase/migrations/20260924222146_fix_enterprise_invitation_conflict.sql`
- `team-permissions.js`
- `tests/enterprise-onboarding-browser.cjs`
- `tests/enterprise-onboarding-database.sql`
- `tests/enterprise-onboarding.test.cjs`
- `tests/worker-flow.test.cjs`
- `vendor/SHEETJS-LICENSE`
- `vendor/xlsx-0.20.3.min.js`
