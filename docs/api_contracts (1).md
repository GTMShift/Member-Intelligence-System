# API Contracts — GTMShift Member Intelligence Platform

All endpoints are prefixed with `/api/v1`
All requests require an `Authorization: Bearer <token>` header unless marked public.
All responses are JSON.
All IDs are UUIDs.

---

## Notes on data cleaning (Jonah's work)
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
    "current_company": "string",
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
    "current_role": "string",
    "current_job_start_date": "string",
    "seniority_level": "string",
    "company_id": "uuid",
    "company_name": "string",
    "country": "string",
    "state_region": "string",
    "city": "string",
    "work_email_enriched": "string",
    "prev_company_1": "string",
    "prev_role_1": "string",
    "prev_company_2": "string",
    "prev_role_2": "string",
    "prev_company_3": "string",
    "prev_role_3": "string",
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
      "type": "meeting | call | email | event | note",
      "summary": "string",
      "occurred_at": "timestamp",
      "logged_by": "string",
      "metadata": {}
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
  "current_role": "string",
  "current_job_start_date": "string",
  "seniority_level": "string",
  "country": "string",
  "state_region": "string",
  "city": "string",
  "work_email_enriched": "string",
  "prev_company_1": "string",
  "prev_role_1": "string",
  "prev_company_2": "string",
  "prev_role_2": "string",
  "prev_company_3": "string",
  "prev_role_3": "string",
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
q          string    full-text search (name, company, role, email)
icp        string    YES | NO
city       string
state      string
country    string
company    string
industry   string
seniority  string
source     string    Website | Luma | Substack | Manual
page       integer   default 1
limit      integer   default 50
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
      "current_role": "string",
      "city": "string",
      "state_region": "string",
      "icp": "YES | NO | null",
      "last_updated": "timestamp"
    }
  ]
}
```

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
  "type": "string",
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
  "type": "string",
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
  "type": "string",
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

## Member Data (JSONB entries)

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
  "logged_by": "James Kaikis"
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
type   string    meeting | call | email | event | note
```

Response:
```json
{
  "member_id": "uuid",
  "interactions": [
    {
      "id": "uuid",
      "type": "string",
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
  "type": "meeting | call | email | event | note",
  "summary": "string",
  "occurred_at": "timestamp",
  "logged_by": "string",
  "metadata": {}
}
```

Example for logging event attendance:
```json
{
  "type": "event",
  "summary": "Attended Sept Wine Dinner",
  "occurred_at": "2026-09-12T18:00:00Z",
  "logged_by": "Meghan",
  "metadata": { "event_name": "Sept Wine Dinner", "location": "Chicago" }
}
```

Response:
```json
{
  "id": "uuid",
  "member_id": "uuid",
  "type": "string",
  "occurred_at": "timestamp"
}
```

---

## Enrichment

### POST /members/:id/enrich
Trigger Apollo enrichment for a single member. Admin only.
Pulls company, role, seniority, location, and previous roles where available.

No request body needed.

Response:
```json
{
  "member_id": "uuid",
  "enriched_fields": ["current_company", "seniority_level", "city"],
  "skipped_fields": ["current_role"],
  "skip_reason": "Manual entry takes priority over Apollo for existing fields",
  "updated_at": "timestamp"
}
```

Notes:
- Fields that already have a manually entered value are NOT overwritten by Apollo
- Only empty fields get filled in by enrichment
- This rule must be confirmed before build (open question #2 from PRD)

---

## Deduplication
> Status: logic still being finalized by Jonah. Do not build this endpoint until dedup rules are locked.

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

## Open questions that affect these contracts

1. Which field wins when Apollo and manual entry conflict? (currently defaulting to manual wins — confirm before building enrichment endpoint)
2. Can members see their own ICP status? (currently admin-only — confirm before building GET /members/:id role logic)
3. Dedup merge endpoint — hold until Jonah finishes dedup logic
4. Calendar sync endpoint — hold until calendar platform is confirmed
