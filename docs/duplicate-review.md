# Duplicate review prototype

## What it does

- `POST /duplicate-review/scan` scans the existing member set and stores proposed pairs. It is server-side and admin-only.
- `GET /duplicate-review?status=pending|deferred|dismissed` returns up to 100 candidates, their reasons, confidence, profile fields, employment history, and linked-record IDs.
- `PATCH /duplicate-review/:id/status` lets an admin defer, dismiss, or return a deferred candidate to pending.
- The scanner normalizes email, LinkedIn URL, and phone. Email and LinkedIn are strong signals. Phone is considered only with a similar name; similar names require a shared current/past company or role. Name-only and phone-only pairs are omitted.
- The confidence value is an explainable heuristic ranking, not a calibrated probability.
- A unique ordered member pair prevents repeated flags. Re-running a scan leaves a prior pair's review status intact.
- The comparison page allows per-field choices and shows a preview with all employment-history rows and linked-record counts. It does not write member data or merge records.

## API and deployment notes

All routes verify a Supabase bearer token and then read the caller's `profiles.role` on the server. Only admins can access this API. The queue table is RLS-enabled and has direct `anon` and `authenticated` grants revoked; the backend accesses it with the server-only service-role client after the role check.

The schema addition is migration `044_duplicate_review_pairs.sql`, sequenced after migration 043. It is additive and leaves migrations 042 and 043 unchanged. Apply it only after both migration branches are integrated in order. Do not run it on production as part of this prototype without the normal migration review and approval.

## Shared-file integration

This branch is based on the migration 43 profile-management branch. It adds a route mount in `backend/index.js` and an admin page route/menu entry in `frontend/src/App.tsx` and `frontend/src/components/HeaderActions.tsx`. The migration 42 PR also changes `backend/index.js` to mount its Join Us route, so preserve both mounts when integrating. The migration 42 branch itself is not included in this workstream branch.

## Records a future merge must account for

The preview enumerates linked IDs for `member_profile`, `employment_history`, `member_data`, `interactions`, `member_socials`, `event_signups`, `newsletter_engagement`, `enrichment_runs`, `profiles`, `substack_subscribers`, `substack_engagement_snapshots`, `join_us_applications`, `otr_applications`, `notifications`, `duplicate_flags`, `members_history`, `member_profile_history`, and `employment_history_log`. Employment rows are shown from both profiles without dropping or combining entries. Account associations and historical snapshots are highlighted for separate handling.

## Safe transactional merge plan — not implemented

1. Require an explicit admin decision and a chosen survivor. Never infer the survivor from match confidence.
2. In one database transaction, lock both member rows and re-check the pair, status, profile links, and all unique constraints.
3. Stop if both members are linked to different auth accounts, or if an application/profile/account relationship is ambiguous. Resolve those cases manually first.
4. Apply the admin's field selections; preserve every employment row and history snapshot. Reassign child rows with table-specific conflict handling (for example, `event_signups` is unique per member/event).
5. Preserve account associations only when there is a single verified account; do not rewrite audit snapshots to hide the original IDs. Record the reviewer, source/target IDs, selected fields, moved records, and timestamp in a durable merge audit record.
6. Verify all references and profile invariants before removing the duplicate row. Any failed check rolls the whole transaction back.

No endpoint in this prototype performs those steps, deletes a member, or merges production data.
