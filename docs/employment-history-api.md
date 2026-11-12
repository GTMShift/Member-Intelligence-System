# Employment history API

The backend verifies a Supabase bearer token and reads the caller's profile role and `member_id`. Admins can access any member's history. Members can access only the member record linked to their profile. The browser must not choose its own role or member identity.

## Read the timeline

`GET /members/:id/employment`

Returns that member's employment rows with the current position first, followed by previous positions in reverse chronological order.

## Change jobs

`POST /members/:id/employment/change`

```json
{
  "company": "Microsoft",
  "role": "Director of Solutions Engineering",
  "start_date": "2026-11-01"
}
```

Requires company, role, and a valid start date. In one database transaction, it closes the existing current position and creates a new current row. The old end date is the day before the new start date. If there is no current row, it creates the first one.

## Correct current information

`POST /members/:id/employment/correct`

Accepts any non-empty subset of `company`, `role`, and `start_date`. It updates the current row in place and does not add a transition. If a member has no current row, company and role are required to create the first position.

Both write endpoints return `{ "current": <employment row>, "history": [<rows newest first>] }`. They also keep `member_profile.company_id` and `member_profile.current_job_start_date` aligned with the current row.

## Self-service profile page

`/my-profile` (`frontend/src/pages/MyProfilePage.tsx`) shows the member's current job, a career timeline, and two actions:

- **Changed jobs** opens an empty form for the new company, job title and start date (all required). It previews the end date the previous job will get, then calls `/change`. With no current job on file the button reads **Add your current job**.
- **Correct current information** opens the current job pre-filled and calls `/correct`. Saving with nothing edited is blocked.

The page checks the same rules as the database before sending (real dates, no future start dates, a new job cannot start before the current one, same company and title is pointed to the correction form; see `frontend/src/lib/employmentForm.ts`). Employment is saved separately from **Save changes**, which only saves contact, professional, location and event details. A job change also notifies admins with a `profile_updated` notification titled "Job change reported" (members may only create `profile_updated` and `new_signup` notifications).

The employment router is mounted before the admin-only `/members` router in `backend/index.js`. Mounted after it, every member request to these endpoints is answered 403 by the admin check. `backend/test/employmentRoutes.test.js` covers that order and the member/admin/applicant access rules.

## Integration notes and edge cases

- Use `/change` only when the member reports a job change; use `/correct` for typos or corrected dates/details.
- The self-service profile page now uses these endpoints and displays the returned career timeline. Admin profile editing and enrichment review still write employment directly; integrate those paths after agreeing whether each edit is a correction or a true job change.
- The partial unique index enforces at most one current row per member. The migration stops with a clear error if existing data already has multiple current rows; resolve those before applying it.
- A new start date earlier than the current role's start date is rejected. Same-day transitions are allowed and close the old role on that date.
- The self-service form must send either the `change` or `correct` action. Admin and enrichment workflows still need an equivalent action before their writes are history-preserving and transactional with the profile projection.
- The `employment_history_write_own` policy from migration 038 still lets a member write their own rows directly with the Supabase client, which skips history preservation. Onboarding (`createMemberSelf.ts`) and the admin editor (`adminUpdateMember.ts`) still write directly too. Once they use these endpoints, that policy can be reduced to read-only.
