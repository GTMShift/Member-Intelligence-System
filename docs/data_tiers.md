# GTMShift Member Data — Three-Tier Classification

Based on James's feedback and the current signup CSV.
Every field in the platform belongs to one of three tiers.
Tier determines who can see it, who can edit it, and where it lives in the database.

---

## Tier 1 — Public
**Who sees it:** Anyone (member + admin)
**Who edits it:** Admin only (pulled from Apollo or set at signup)
**Where it lives:** `members` table + `member_profile` table
**Purpose:** Structured, searchable data for filtering and event targeting

| CSV Column | DB Field | Notes |
|---|---|---|
| First Name | `members.first_name` | |
| Last Name | `members.last_name` | |
| Email Address | `members.email` | Unique identifier |
| Linkedin | `members.linkedin_url` | Unique identifier |
| Phone Number | `members.phone` | |
| Current Company Name | `member_profile.current_company` | |
| Current Role | `member_profile.current_role` | |
| Current Job Start Date | `member_profile.current_job_start_date` | |
| Seniority Level seniority | `member_profile.seniority_level` | |
| Current Company Linkedin | `member_profile.company_linkedin_url` | |
| Current_company Domain | `member_profile.company_domain` | |
| Size | `member_profile.company_size` | |
| Industry | `member_profile.company_industry` | |
| Sub Industry | `member_profile.company_sub_industry` | |
| Overview (Current Company) | `member_profile.company_overview` | |
| Type | `member_profile.company_type` | |
| Formatted Revenue | `member_profile.company_revenue` | |
| Company Tags (2) | `member_profile.company_tags` | |
| Country | `member_profile.country` | |
| State/Region | `member_profile.state_region` | |
| City | `member_profile.city` | |
| Work Email (enriched) | `member_profile.work_email_enriched` | From Apollo |
| Prev Company 1/2/3 | `member_profile.prev_company_1/2/3` | |
| Prev Role 1/2/3 | `member_profile.prev_role_1/2/3` | |
| Tags | `member_profile.signup_source` | Website, Luma, Substack |

---

## Tier 2 — User-Editable
**Who sees it:** Member (their own) + Admin (all)
**Who edits it:** The member themselves via the portal
**Where it lives:** `member_data` table, `tier = 'user_editable'`
**Purpose:** Self-reported qualitative info — challenges, interests, goals

| CSV Column | category field | Example data shape |
|---|---|---|
| What is one thing you want to get out of this event? | `event_feedback` | `{ "question": "...", "answer": "..." }` |
| (future) Top 3 challenges right now | `challenge` | `{ "text": "...", "submitted_at": "..." }` |
| (future) Personal interests | `interest` | `{ "text": "wine, hiking, AI" }` |
| (future) Team dynamics / mandates | `mandate` | `{ "text": "..." }` |

These are timestamped and never overwritten — every update adds a new row so you keep the full history of what a member said over time.

---

## Tier 3 — Admin-Only
**Who sees it:** Admin only (James, Meghan, team)
**Who edits it:** Admin only
**Where it lives:** `member_data` table, `tier = 'admin_only'` + `interactions` table
**Purpose:** Internal intelligence — notes, transcripts, qualification flags

| Field | category / table | Example data shape |
|---|---|---|
| ICP flag (YES/NO) | `member_profile.icp` | `"YES"` or `"NO"` |
| One-on-one notes | `member_data`, `category = 'note'` | `{ "text": "Strong fit, intro'd by Chris" }` |
| Meeting transcripts | `member_data`, `category = 'transcript'` | `{ "source": "Zoom", "text": "..." }` |
| Internal flags | `member_data`, `category = 'flag'` | `{ "reason": "Non-ICP personal connection" }` |
| Meetings | `interactions`, `type = 'meeting'` | `{ "summary": "...", "occurred_at": "..." }` |
| Calls | `interactions`, `type = 'call'` | |
| Emails | `interactions`, `type = 'email'` | |
| Event attendance | `interactions`, `type = 'event'` | `{ "event_name": "Sept Wine Dinner" }` |

---

## Summary

| Tier | Table(s) | Editable by |
|---|---|---|
| Public | `members`, `member_profile` | Admin |
| User-Editable | `member_data` (tier = user_editable) | Member |
| Admin-Only | `member_data` (tier = admin_only), `interactions` | Admin |

---

## Open questions that affect this model

1. Can members see their own ICP status? (currently admin-only — confirm with James)
2. When Apollo enriches a field the member already filled in, which wins?
3. Do members get notified when their profile is updated by the team?
