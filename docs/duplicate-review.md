# Duplicate review prototype

## What it does

- `POST /duplicate-review/scan` scans the existing member set and stores proposed pairs. It is server-side and admin-only.
- `GET /duplicate-review?status=pending|deferred|dismissed` returns up to 100 candidates, their reasons, confidence, profile fields, employment history, and linked-record IDs.
- `PATCH /duplicate-review/:id/status` lets an admin defer, dismiss, or return a deferred candidate to pending.
- `POST /duplicate-review/:id/merge` accepts an explicit survivor and the field-source choices from the comparison page. It only accepts pending or deferred pairs.
- The scanner normalizes email, LinkedIn URL, and phone. Email and LinkedIn are strong signals. Phone is considered only with a similar name; similar names require a shared current/past company or role. Name-only and phone-only pairs are omitted.
- The confidence value is an explainable heuristic ranking, not a calibrated probability.
- A unique ordered member pair prevents repeated flags. Re-running a scan leaves a prior pair's review status intact.
- The comparison page allows per-field choices, selects which profile survives, and requires a browser confirmation before the merge request is sent.
- The merge runs in one database transaction. It preserves the full employment timeline, keeps the selected current job, combines non-empty profile fields, moves linked records, transfers one existing login link, and rewires other duplicate candidates to the survivor. A second login link on the two records blocks the merge.
- The source member row remains as an archived record with `merged_into_member_id` pointing to the survivor. This keeps existing history foreign keys valid and preserves original identity data. Active-member searches and scans exclude archived rows.
- A durable, service-role-only audit stores both original member records, the linked rows from the archived record, the selected fields, the resulting survivor, the reviewer, and affected row counts. Historical snapshot tables retain their original member IDs.
- A unique-key or foreign-key conflict rolls back the transaction. The API returns a conflict so an administrator can resolve it before retrying. No silent row deletion is used to get around conflicting linked records.

## API and deployment notes

All routes verify a Supabase bearer token and then read the caller's `profiles.role` on the server. Only admins can access this API. The queue table is RLS-enabled and has direct `anon` and `authenticated` grants revoked; the backend accesses it with the server-only service-role client after the role check.

The schema additions are in migration `044_duplicate_review_pairs.sql`, sequenced after the existing profile-management migrations. It creates the review queue, admin-audited merge RPC, and private audit table. Apply it after the preceding migration branches are integrated and review and test it in staging. The merge action changes real member records when an administrator confirms it; do not perform production merges without the normal approval process.

## Shared-file integration

This branch is based on the migration 43 profile-management branch. It adds a route mount in `backend/index.js` and an admin page route/menu entry in `frontend/src/App.tsx` and `frontend/src/components/HeaderActions.tsx`. The migration 42 PR also changes `backend/index.js` to mount its Join Us route, so preserve both mounts when integrating. The migration 42 branch itself is not included in this workstream branch.

## Records a future merge must account for

The preview enumerates linked IDs for `member_profile`, `employment_history`, `member_data`, `interactions`, `member_socials`, `event_signups`, `newsletter_engagement`, `enrichment_runs`, `profiles`, `substack_subscribers`, `substack_engagement_snapshots`, `join_us_applications`, `otr_applications`, `notifications`, `duplicate_flags`, `members_history`, `member_profile_history`, and `employment_history_log`. Employment rows are shown from both profiles without dropping or combining entries. Account associations and historical snapshots are highlighted for separate handling.

## Merge safeguards and current limits

1. An admin must select the survivor; confidence score never selects it automatically.
2. The database rechecks the admin role, candidate state, profile links, and survivor choice while locking both members. The service-role-only RPC runs as an invoker and the backend supplies the verified admin ID.
3. The merge is refused when both records have login accounts. Unique and foreign-key violations also roll back the whole transaction; resolve the conflicting record and retry.
4. Employment rows are retained, the selected current job remains current, profile choices are applied, and linked records move to the survivor. Existing history snapshots keep the original IDs.
5. The source row is marked archived after its full review data is preserved in the audit record. Other queued pairs are redirected to the survivor and coalesced when the same pair already exists.

The merge is transactional and has no automatic undo button. The source row and complete audit snapshot remain available for a manual restore or a database restore. Use synthetic records in tests and require administrator approval before production use.
