from app.core.db import supabase
from app.schemas.enrichment import (
    ApolloOrganization,
    ApolloPersonResponse,
    EnrichmentRunCreate,
    EnrichmentRunStatus,
    EnrichmentRunType,
)


def enrich_member(
    member_id: str,
    apollo: ApolloPersonResponse,
    run_type: EnrichmentRunType = EnrichmentRunType.manual,
) -> EnrichmentRunCreate:
    person = apollo.person

    if person is None:
        return EnrichmentRunCreate(
            member_id=member_id,
            run_type=run_type,
            status=EnrichmentRunStatus.failed,
            error_message="Apollo returned no person data for this member",
        )

    updated: dict = {}
    skipped: dict = {}

    # ------------------------------------------------------------------
    # member_profile — scalar fields
    # ------------------------------------------------------------------
    profile_patch: dict = {}

    if person.seniority:
        profile_patch["seniority_level"] = person.seniority
        updated["seniority_level"] = person.seniority
    else:
        skipped["seniority_level"] = "apollo returned null"

    if person.city:
        profile_patch["city"] = person.city
        updated["city"] = person.city
    else:
        skipped["city"] = "apollo returned null"

    if person.state:
        profile_patch["state_region"] = person.state
        updated["state_region"] = person.state
    else:
        skipped["state_region"] = "apollo returned null"

    if person.country:
        profile_patch["country"] = person.country
        updated["country"] = person.country
    else:
        skipped["country"] = "apollo returned null"

    if person.email:
        profile_patch["work_email_enriched"] = person.email
        updated["work_email_enriched"] = person.email
    else:
        skipped["work_email_enriched"] = "apollo returned null"

    # ------------------------------------------------------------------
    # companies — upsert by domain, then link company_id to member_profile
    # ------------------------------------------------------------------
    if person.organization and person.organization.primary_domain:
        company_id = _upsert_company(person.organization)
        profile_patch["company_id"] = company_id
        updated["company_id"] = company_id
    else:
        skipped["company_id"] = "apollo organization missing domain"

    # ------------------------------------------------------------------
    # employment_history — delete previous Apollo rows then re-insert.
    # This makes re-enrichment idempotent: running it twice gives the
    # same result as running it once.
    # ------------------------------------------------------------------
    supabase.table("employment_history").delete().eq("member_id", member_id).eq("source", "Apollo").execute()

    current_job = None
    for job in person.employment_history:
        row = {
            "member_id": member_id,
            "company": job.organization_name or "",
            "role": job.title,
            "start_date": job.start_date,
            "end_date": job.end_date,
            "is_current": job.current,
            "source": "Apollo",
        }
        supabase.table("employment_history").insert(row).execute()
        if job.current:
            current_job = job

    updated["employment_history"] = len(person.employment_history)

    if current_job and current_job.start_date:
        profile_patch["current_job_start_date"] = current_job.start_date
        updated["current_job_start_date"] = current_job.start_date

    # ------------------------------------------------------------------
    # Flush member_profile patch
    # ------------------------------------------------------------------
    if profile_patch:
        supabase.table("member_profile").update(profile_patch).eq("member_id", member_id).execute()

    # ------------------------------------------------------------------
    # members.enriched_at
    # ------------------------------------------------------------------
    supabase.table("members").update({"enriched_at": "now()"}).eq("id", member_id).execute()

    return EnrichmentRunCreate(
        member_id=member_id,
        run_type=run_type,
        status=EnrichmentRunStatus.success,
        fields_updated=updated,
        fields_skipped=skipped,
    )


def persist_run(run: EnrichmentRunCreate) -> dict:
    result = supabase.table("enrichment_runs").insert(run.model_dump()).execute()
    return result.data[0]


def get_runs_for_member(member_id: str) -> list[dict]:
    result = (
        supabase.table("enrichment_runs")
        .select("*")
        .eq("member_id", member_id)
        .order("ran_at", desc=True)
        .execute()
    )
    return result.data


def get_run_by_id(run_id: str) -> dict | None:
    result = (
        supabase.table("enrichment_runs")
        .select("*")
        .eq("id", run_id)
        .single()
        .execute()
    )
    return result.data


def _upsert_company(org: ApolloOrganization) -> str:
    row = {
        "name": org.name,
        "domain": org.primary_domain,
        "linkedin_url": org.linkedin_url,
        "industry": org.industry,
        "overview": org.short_description,
        "company_type": org.company_type,
        "revenue": org.revenue_range,
    }
    result = (
        supabase.table("companies")
        .upsert(row, on_conflict="domain")
        .execute()
    )
    return result.data[0]["id"]
