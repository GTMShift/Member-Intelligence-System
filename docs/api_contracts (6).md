# API Contracts — GTMShift Member Intelligence Platform

All endpoints are prefixed with `/api/v1`
All requests require an `Authorization: Bearer <token>` header unless marked public.
All responses are JSON.
All IDs are UUIDs.

---

## Notes on data cleaning
- LinkedIn URLs are cleaned — no appended data (e.g. `,True` removed)
- Phone numbers are in E.164 format (e.g. `+15551234567`)
- Duplicate members are being merged — dedup logic still in progress

---

## Auth

### POST /auth/google
Google SSO login for admin team members.

Request body:
```json
{
  "google_token": "string"
}
```

Response:
```json
{
  "token": "string",
  "role": "admin",
  "user": {
    "name": "string",
    "email": "string"
  }
}
```

---

### POST /auth/linkedin
LinkedIn SSO login for members signing up or logging into the portal.
Auto-pulls photo, title, and basic info on first login.

Request body:
```json
{
  "linkedin_token": "string"
}
```

Response:
```json
{
  "token": "string",
  "role": "member",
  "member_id": "uuid",
  "prefilled": {
    "first_name": "string",
    "last_name": "string",
    "linkedin_url": "string",
    "current_role": "string",
    "company_name": "string",
    "photo_url": "string"
  }
}
```

---

## Members

### GET /members
Get all members. Admin only.
Supports pagination.

Query params:
```
page       integer   default 1
limit      integer   default 50, max 100
```

Response:
```json
{
  "total": 781,
  "page": 1,
  "limit": 50,
  "members": [
    {
      "id": "uuid",
      "first_name": "string",
      "last_name": "string",
      "email": "string",
      "linkedin_url": "string",
      "phone": "string",
      "created_at": "timestamp",
      "last_updated": "timestamp"
    }
  ]
}
```

---

### GET /members/:id
Get one full member profile. Admin gets all three tiers. Member gets their own public + user_editable only.

Company info is not returned inline — only company_id and company_name are returned.
To view full company details, call GET /companies/:id.

Current job title is not stored on member_profile — it comes from employment_history where is_current = true.

Response:
```json
{
  "id": "uuid",
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "linkedin_url": "string",
  "phone": "string",
  "created_at": "timestamp",
  "last_updated": "timestamp",
  "profile": {
    "current_job_start_date": "string",
    "seniority_level": "string",
    "company_id": "uuid",
    "company_name": "string",
    "country": "string",
    "state_region": "string",
    "city": "string",
    "work_email_enriched": "string",
    "icp": "YES | NO | null",
    "signup_source": "string",
    "updated_at": "timestamp"
  },
  "member_data": [
    {
      "id": "uuid",
      "tier": "user_editable | admin_only",
      "category": "challenge | interest | event_feedback | note | transcript | flag | mandate",
      "data": {},
      "logged_by": "string",
      "created_at": "timestamp"
    }
  ],
  "interactions": [
    {
      "id": "uuid",
      "interaction_type": "meeting | call | email | event | note",
      "summary": "string",
      "occurred_at": "timestamp",
      "logged_by": "string",
      "metadata": {}
    }
  ],
  "employment_history": [
    {
      "id": "uuid",
      "company": "string",
      "role": "string",
      "start_date": "date",
      "end_date": "date",
      "is_current": true,
      "source": "Apollo | Manual | Import"
    }
  ]
}
```

---

### POST /members
Create a new member. Used by Framer form and manual admin entry.

Request body:
```json
{
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "linkedin_url": "string",
  "phone": "string",
  "company_id": "uuid",
  "current_role": "string",
  "signup_source": "Website | Luma | Substack | Manual",
  "event_feedback": "string"
}
```

Notes:
- `email` and `linkedin_url` are unique — if either already exists, return a 409 conflict
- `event_feedback` maps to a `member_data` row with `tier = 'user_editable'` and `category = 'event_feedback'`
- `current_role` creates an entry in `employment_history` with `is_current = true`
- Phone must be in E.164 format (e.g. `+15551234567`)

Response:
```json
{
  "id": "uuid",
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "linkedin_url": "string",
  "created_at": "timestamp"
}
```

Errors:
```
409 — member with this email or linkedin_url already exists
400 — missing required fields
```

---

### PATCH /members/:id
Update a member's core identity fields. Admin only.

Request body (all fields optional):
```json
{
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "linkedin_url": "string",
  "phone": "string"
}
```

Response:
```json
{
  "id": "uuid",
  "last_updated": "timestamp"
}
```

---

### PATCH /members/:id/profile
Update a member's profile fields. Admin only.
This is separate from core identity to keep changes auditable.

Request body (all fields optional):
```json
{
  "company_id": "uuid",
  "current_job_start_date": "string",
  "seniority_level": "string",
  "country": "string",
  "state_region": "string",
  "city": "string",
  "work_email_enriched": "string",
  "icp": "YES | NO",
  "signup_source": "string"
}
```

Response:
```json
{
  "member_id": "uuid",
  "updated_at": "timestamp"
}
```

---

### DELETE /members/:id
Delete a member. Admin only. Cascades to profile, member_data, and interactions.

Response:
```json
{
  "deleted": true,
  "id": "uuid"
}
```

---

## Search

### GET /members/search
Full-text and filtered search across all member data. Admin only.
Returns < 2 seconds per PRD performance SLA.

Query params:
```
q              string    full-text search (name, company, role, email)
icp            string    YES | NO
metro_area     string    filter by metro area name (e.g. "New York City")
state          string
country        string
company        string
industry       string
seniority      string
source         string    Website | Luma | Substack | Manual
team_size      string    1-10 | 11-50 | 51-200 | 201-500 | 501-1000 | 1000+
tags           string    filter by company tags
event_attended string    returns members who attended this event name
page           integer   default 1
limit          integer   default 50
```

Response:
```json
{
  "total": 42,
  "page": 1,
  "limit": 50,
  "results": [
    {
      "id": "uuid",
      "first_name": "string",
      "last_name": "string",
      "email": "string",
      "company_id": "uuid",
      "company_name": "string",
      "company_size": "string",
      "company_tags": "string",
      "current_role": "string",
      "metro_area_name": "string | null",
      "state_region": "string",
      "icp": "YES | NO | null",
      "last_updated": "timestamp"
    }
  ]
}
```

Note: `current_role` in search results is derived from `employment_history` where `is_current = true`.
Note: `metro_area_name` replaces exact city filtering — members are grouped by proximity to metro area center coordinates.

---

## Companies

### GET /companies/:id
Get full details for a company. Called when a user clicks a company name in the admin dashboard.

Response:
```json
{
  "id": "uuid",
  "name": "string",
  "linkedin_url": "string",
  "domain": "string",
  "size": "string",
  "industry": "string",
  "sub_industry": "string",
  "overview": "string",
  "company_type": "string",
  "revenue": "string",
  "tags": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

---

### GET /companies
Get all companies. Admin only.

Response:
```json
{
  "total": 120,
  "companies": [
    {
      "id": "uuid",
      "name": "string",
      "domain": "string",
      "industry": "string",
      "size": "string"
    }
  ]
}
```

---

### POST /companies
Create a new company record. Admin only.
Check for existing company by domain before creating to avoid duplicates.

Request body:
```json
{
  "name": "string",
  "linkedin_url": "string",
  "domain": "string",
  "size": "string",
  "industry": "string",
  "sub_industry": "string",
  "overview": "string",
  "company_type": "string",
  "revenue": "string",
  "tags": "string"
}
```

Response:
```json
{
  "id": "uuid",
  "name": "string",
  "created_at": "timestamp"
}
```

Errors:
```
409 — company with this domain already exists
400 — missing required fields
```

---

### PATCH /companies/:id
Update a company record. Admin only.

Request body (all fields optional):
```json
{
  "name": "string",
  "linkedin_url": "string",
  "domain": "string",
  "size": "string",
  "industry": "string",
  "sub_industry": "string",
  "overview": "string",
  "company_type": "string",
  "revenue": "string",
  "tags": "string"
}
```

Response:
```json
{
  "id": "uuid",
  "updated_at": "timestamp"
}
```

---

## Employment History

### GET /members/:id/employment
Get full employment history for a member. Admin and member (own profile only).
Current role is the entry where is_current = true.

Response:
```json
{
  "member_id": "uuid",
  "employment_history": [
    {
      "id": "uuid",
      "company": "string",
      "role": "string",
      "start_date": "date",
      "end_date": "date",
      "is_current": true,
      "source": "Apollo | Manual | Import"
    }
  ]
}
```

---

### POST /members/:id/employment
Add a new employment history entry. Admin only.
When adding a current role, set is_current = true.
The previous current role will automatically be set to is_current = false.

Request body:
```json
{
  "company": "string",
  "role": "string",
  "start_date": "date",
  "end_date": "date",
  "is_current": true,
  "source": "Apollo | Manual | Import"
}
```

Response:
```json
{
  "id": "uuid",
  "member_id": "uuid",
  "company": "string",
  "created_at": "timestamp"
}
```

---

## Events

### GET /events
Get all events. Admin only.

Response:
```json
{
  "total": 10,
  "events": [
    {
      "id": "uuid",
      "luma_event_id": "string",
      "event_name": "string",
      "event_date": "timestamp",
      "event_type": "string",
      "capacity": 50,
      "location": "string"
    }
  ]
}
```

---

### POST /events
Create a new event. Admin only.

Request body:
```json
{
  "luma_event_id": "string",
  "event_name": "string",
  "event_date": "timestamp",
  "event_type": "string",
  "capacity": 50,
  "location": "string"
}
```

Response:
```json
{
  "id": "uuid",
  "event_name": "string",
  "created_at": "timestamp"
}
```

Errors:
```
409 — event with this luma_event_id already exists
400 — missing required fields
```

---

### POST /events/:id/signups
Register a member for an event.

Request body:
```json
{
  "member_id": "uuid",
  "rsvp_status": "registered | attended | no_show | canceled",
  "signup_date": "timestamp",
  "event_goal": "string",
  "approval_status": "string"
}
```

Response:
```json
{
  "id": "uuid",
  "member_id": "uuid",
  "event_id": "uuid",
  "rsvp_status": "string",
  "created_at": "timestamp"
}
```

Errors:
```
409 — member already signed up for this event
400 — missing required fields
```

---

## Enrichment

### GET /members/:id/data
Get all member_data entries for a member.
Admin gets all tiers. Member gets only their own user_editable entries.

Query params:
```
tier      string    user_editable | admin_only
category  string    challenge | interest | note | event_feedback | transcript | flag | mandate
```

Response:
```json
{
  "member_id": "uuid",
  "entries": [
    {
      "id": "uuid",
      "tier": "string",
      "category": "string",
      "data": {},
      "logged_by": "string",
      "created_at": "timestamp"
    }
  ]
}
```

---

### POST /members/:id/data
Add a new member_data entry. Never overwrites — always appends.
Admin can post any tier. Members can only post user_editable.

Request body:
```json
{
  "tier": "user_editable | admin_only",
  "category": "challenge | interest | note | event_feedback | transcript | flag | mandate",
  "data": {},
  "logged_by": "string"
}
```

Example for a member submitting a challenge:
```json
{
  "tier": "user_editable",
  "category": "challenge",
  "data": { "text": "Keeping my team relevant in a world of AI-generated demos" },
  "logged_by": "self"
}
```

Example for admin adding a note:
```json
{
  "tier": "admin_only",
  "category": "note",
  "data": { "text": "Strong ICP fit, intro'd by Chris at Sept dinner" },
  "logged_by": "admin"
}
```

Response:
```json
{
  "id": "uuid",
  "member_id": "uuid",
  "tier": "string",
  "category": "string",
  "created_at": "timestamp"
}
```

Errors:
```
403 — member trying to post admin_only tier
400 — missing required fields
```

---

## Interactions

### GET /members/:id/interactions
Get the full interaction timeline for a member. Admin only.

Query params:
```
interaction_type   string    meeting | call | email | event | note
```

Response:
```json
{
  "member_id": "uuid",
  "interactions": [
    {
      "id": "uuid",
      "interaction_type": "string",
      "summary": "string",
      "occurred_at": "timestamp",
      "logged_by": "string",
      "metadata": {}
    }
  ]
}
```

---

### POST /members/:id/interactions
Log a new interaction. Admin only.

Request body:
```json
{
  "interaction_type": "meeting | call | email | event | note",
  "summary": "string",
  "occurred_at": "timestamp",
  "logged_by": "string",
  "metadata": {}
}
```

Example for logging event attendance:
```json
{
  "interaction_type": "event",
  "summary": "Attended Sept Wine Dinner",
  "occurred_at": "2026-09-12T18:00:00Z",
  "logged_by": "admin",
  "metadata": { "event_name": "Sept Wine Dinner", "location": "Chicago" }
}
```

Response:
```json
{
  "id": "uuid",
  "member_id": "uuid",
  "interaction_type": "string",
  "occurred_at": "timestamp"
}
```

---

## Enrichment

### POST /members/:id/enrich
Trigger Apollo enrichment for a single member. Admin only.
Pulls company, role, seniority, location, and employment history where available.

No request body needed.

Response:
```json
{
  "member_id": "uuid",
  "enriched_fields": ["company_id", "seniority_level", "city"],
  "conflict_fields": ["role"],
  "conflict_detail": {
    "role": { "manual": "VP of Sales", "apollo": "Vice President, Sales" }
  },
  "skipped_fields": [],
  "updated_at": "timestamp"
}
```

Notes:
- Manual entry always wins — Apollo never overwrites an existing manually entered value
- If Apollo data conflicts with a manual entry, it is flagged in conflict_fields with a side-by-side comparison for admin review
- Only empty fields get filled in automatically
- Final decision on conflicts rests with the admin team

---

## Deduplication
> Status: logic still being finalized by the team. Do not build this endpoint until dedup rules are locked.
> Approach: keep all historical data with timestamps. No merge UI for now.
> Member-facing confirmation flow for email/phone changes is future state.

### POST /members/dedup/check
Check if a member being created already exists.
Called automatically before POST /members.

Request body:
```json
{
  "email": "string",
  "linkedin_url": "string",
  "phone": "string"
}
```

Response:
```json
{
  "duplicate_found": true,
  "existing_member_id": "uuid",
  "matched_on": "email | linkedin_url | phone"
}
```

---

## Notifications

### GET /notifications
Get all notifications. Admin only.

Query params:
```
type       string    duplicate_detected | job_change | new_signup | enrichment_complete | enrichment_failed | profile_updated
is_read    boolean   true | false
page       integer   default 1
limit      integer   default 50
```

Response:
```json
{
  "total": 24,
  "page": 1,
  "limit": 50,
  "notifications": [
    {
      "id": "uuid",
      "type": "string",
      "title": "string",
      "body": "string",
      "member_id": "uuid | null",
      "member_name": "string | null",
      "is_read": false,
      "created_at": "timestamp"
    }
  ]
}
```

---

### PATCH /notifications/:id/read
Mark a single notification as read. Admin only.

No request body needed.

Response:
```json
{
  "id": "uuid",
  "is_read": true
}
```

---

### PATCH /notifications/read-all
Mark all notifications as read. Admin only.

No request body needed.

Response:
```json
{
  "updated": 12
}
```

---

## Metro Areas

### GET /metro-areas
Get all defined metro areas. Admin only.

Response:
```json
{
  "metro_areas": [
    {
      "id": "uuid",
      "name": "New York City",
      "center_lat": 40.7128,
      "center_lng": -74.0060,
      "radius_miles": 60
    }
  ]
}
```

---

### POST /metro-areas
Create a new metro area. Admin only.

Request body:
```json
{
  "name": "string",
  "center_lat": 0.0,
  "center_lng": 0.0,
  "radius_miles": 60
}
```

Response:
```json
{
  "id": "uuid",
  "name": "string",
  "created_at": "timestamp"
}
```

---

## Open Questions — Resolved

1. Which field wins when Apollo and manual entry conflict?
   RESOLVED: Manual entry always wins. Conflicting Apollo data is flagged
   for admin review with a side-by-side comparison. Admin team makes the final call.

2. Can members see their own ICP status?
   RESOLVED: No. ICP is admin-only. Members never see it.

3. Dedup merge logic?
   RESOLVED: Keep all historical data with timestamps. No merge UI for now.
   Member-facing confirmation flow for email/phone is future state.
   Endpoint still on hold until dedup rules are fully finalized.

4. Calendar platform for interaction sync?
   RESOLVED: Google Calendar + Granola via Atlas mac mini with local model.
   Transcripts push from Granola into Supabase via a script on Atlas.
   Too complex for current phase — flagged for future build. Endpoint on hold.
