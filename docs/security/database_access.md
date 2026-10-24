# Database access security

Migration `038_auth_api_database_security.sql` is a local draft for the member/admin boundary in Postgres; it has not been applied to the hosted Supabase project. Database policies use `auth.uid()` and trusted `profiles.role`/`profiles.member_id`; browser-supplied role labels and matching `members.email` are not authorization.

The migration scans `pg_policies` and removes every `temp_allow_all`/`temp_all` policy in `public`, including the observed history, enrichment, metro-area, and Substack tables. It then adds admin-only policies for the operational/history tables, authenticated read access for metro-area reference data, and the existing scoped policies for member workflows. PostgreSQL combines permissive policies with OR, so leaving any of those temporary policies would defeat the replacements. The migration also removes `TRUNCATE` privileges from the listed application tables because RLS does not protect that operation. Other differently named permissive policies and live grants still need review before deployment.

The admin-checked `search_members` wrappers preserve every existing overload’s argument and result signature and add the admin check, including a hosted `p_bucket` overload if it is present. The migration aborts if an overload has unnamed inputs rather than guessing its signature. Local tests check the wrappers present in the checked-in schema; the hosted `p_bucket` definition still needs a signature-by-signature comparison because it is not part of the local migration history. For `create_member_full`, authenticated execution is granted only to the single guarded `SECURITY DEFINER` signature defined by this migration; all other overloads are revoked from authenticated callers and left for service-role use. This migration uses existing trusted `profiles.role` values for policy checks; it does not assign or normalize roles.

The fresh local replay also needed baselines for `otr_applications` and `form_responses`, which were created outside the checked-in migration history. Migrations `0145_otr_applications_baseline.sql` and `0335_form_responses_baseline.sql` use `CREATE TABLE IF NOT EXISTS` to supply only the columns needed by later migrations in a clean local database. They leave existing tables untouched. The duplicate historical migration versions were made unique as `0211` and `0221` so Supabase CLI can replay them. Reconcile these version changes and the full external-form schemas against the hosted migration history before any shared or production deployment.

## Access model

- Anonymous users cannot read member, profile, intelligence, or history data. Public OTR submissions remain pending; public event reads remain enabled.
- Admin access is checked against the existing trusted `profiles.role`. Role provisioning and role lifecycle are intentionally outside this migration.
- A member can access only the member row linked through their own `profiles.member_id`, and only while their trusted profile role is `member`. An `applicant` role does not satisfy that check.
- `member_profile` is directly readable and writable only by admins. The migration defines `get_my_member_profile()` and `save_my_member_profile(jsonb)` for a safe-field projection and allowlisted self-service edits, but the current frontend has not been updated to call them. Member profile workflows therefore require coordinated frontend integration before this policy is deployed. The member-search RPC is admin-checked.
- Speaker applications remain submittable by a linked member, but the member can only submit/read their own pending application; review remains admin-only.
- A members-table contact, verified email match, event signup, or OTR application does not create a `profiles.member_id` link.
- Member creation, deletion preview/deletion, and search are guarded in database functions; direct profile role/link updates are not granted to authenticated users.

## Approval-flow integration requirement

The checked-in project documentation has no trusted member-approval field or database operation. To avoid treating a contact as approval, `link_my_member_profile` now returns only an existing trusted link; it does not create one. This preserves existing linked accounts but means an unlinked account cannot complete the current self-service profile-creation flow. Keep that flow disabled or handle it as pending until the approval workstream provides and integrates a trusted approval/link operation. Do not restore email-based self-linking as a workaround.

The applicant-role constraint/lifecycle change is owned by the approval workstream. Apply and test this migration against the integrated schema, and verify applicants remain non-members even if a stale `member_id` exists.

## Column-level privacy integration blocker

RLS limits rows, not columns. The migration blocks direct member reads of `member_profile` and defines an explicit safe-field projection through `get_my_member_profile()`. The current frontend still uses its pre-existing direct-table profile paths; those paths have not been integrated with the new RPCs. Admins retain direct table access. Member rows and any other mixed-data tables still require their own column-level review before claiming that every admin-only field across the platform is private. Applicant approval and account linking remain with their owning workstream.

## Exposed external webhook

The supplied live trigger catalog includes a Make custom-webhook URL in the `otr_applications` insert trigger. Treat that URL as a bearer-like secret because a custom webhook URL can trigger its Make scenario when called. The trigger shown in the catalog sends only a content-type header, with no additional authentication header. The Make scenario could still have an independent validation step, but that cannot be confirmed from the database catalog. Rotate or replace the webhook in Make, update the database trigger to the replacement, and verify the scenario rejects unauthenticated requests before production rollout. No Make or hosted database changes have been made as part of this work.

## Isolated validation and rollout

Use isolated test identities and synthetic records only:

1. Start a local Supabase instance and apply all migrations with `supabase db reset`.
2. Run `supabase test db`; `supabase/tests/database_security.sql` checks anonymous, linked-member, unlinked-account, and admin permissions.
3. Manually verify admin CRUD/search and existing linked-member profile reads/updates. Confirm that classification updates are denied to members.
4. Review applicant-role integration, pending/unlinked-account handling, and the column-level privacy integration blocker before a staging deployment.
5. Before any shared or production application, compare the complete live schema, policies, grants, triggers, and function signatures with the migration and obtain the required deployment approval. The migration does not assign roles, approve members, or delete data; it intentionally stops new self-linking until approval is integrated.

The current `supabase/tests/database_security.sql` declares and passes 33 pgTAP assertions against the local Supabase database. This validates the checked-in local schema and test cases, not the hosted project. The CLI skips the zero-byte `023_icp_functions` placeholder because it does not match the CLI migration filename pattern; that placeholder was not changed.

The migration remains a draft for review. Remaining requirements before a shared deployment are: reconcile the external table definitions and renamed migration versions with hosted history; coordinate applicant-role/approval linking with its owning workstream; integrate and test the frontend member-profile flows against the safe profile RPCs; validate admin CRUD/search plus existing linked-member profile workflows against the integrated development schema; and rotate/update the exposed Make webhook after confirming its authentication settings. No hosted database or Make changes have been made.

The table-grants query was not included in the supplied catalog results, so the hosted grants have not been audited. Compare them before rollout; the local draft explicitly revokes `TRUNCATE` and relies on RLS plus the checked policies for ordinary table operations.
