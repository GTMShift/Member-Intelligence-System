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

## Integration notes and edge cases

- Use `/change` only when the member reports a job change; use `/correct` for typos or corrected dates/details.
- The self-service profile page now uses these endpoints and displays the returned career timeline. Admin profile editing and enrichment review still write employment directly; integrate those paths after agreeing whether each edit is a correction or a true job change.
- The partial unique index enforces at most one current row per member. The migration stops with a clear error if existing data already has multiple current rows; resolve those before applying it.
- A new start date earlier than the current role's start date is rejected. Same-day transitions are allowed and close the old role on that date.
- The self-service form must send either the `change` or `correct` action. Admin and enrichment workflows still need an equivalent action before their writes are history-preserving and transactional with the profile projection.
