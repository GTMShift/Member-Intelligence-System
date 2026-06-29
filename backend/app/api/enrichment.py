import httpx
from fastapi import APIRouter, HTTPException

from app.core import apollo as apollo_client
from app.schemas.enrichment import (
    EnrichmentRunResponse,
    EnrichmentRunType,
    EnrichmentTriggerRequest,
    EnrichmentTriggerResponse,
)
from app.services import enrichment_service
from app.core.db import supabase

router = APIRouter(prefix="/members", tags=["enrichment"])


@router.post("/{member_id}/enrich", response_model=EnrichmentTriggerResponse)
def enrich_member(member_id: str, body: EnrichmentTriggerRequest):
    # Fetch the member's linkedin_url — that's what Apollo matches on
    member_result = (
        supabase.table("members")
        .select("linkedin_url, email")
        .eq("id", member_id)
        .single()
        .execute()
    )
    if not member_result.data:
        raise HTTPException(status_code=404, detail="Member not found")

    member = member_result.data
    linkedin_url = member.get("linkedin_url")
    email = member.get("email")

    # Call Apollo — prefer LinkedIn URL, fall back to email
    try:
        if linkedin_url:
            apollo_response = apollo_client.fetch_person_by_linkedin(linkedin_url)
        elif email:
            apollo_response = apollo_client.fetch_person_by_email(email)
        else:
            raise HTTPException(
                status_code=422,
                detail="Member has no linkedin_url or email to look up in Apollo",
            )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Apollo API error: {e.response.status_code}",
        )

    # Map Apollo data → DB tables
    run = enrichment_service.enrich_member(
        member_id=member_id,
        apollo=apollo_response,
        run_type=body.run_type,
    )

    # Persist the run log to enrichment_runs
    persisted = enrichment_service.persist_run(run)

    return EnrichmentTriggerResponse(
        run_id=persisted["id"],
        status=run.status,
        fields_updated=run.fields_updated,
        fields_skipped=run.fields_skipped,
    )


@router.get("/{member_id}/enrichment-runs", response_model=list[EnrichmentRunResponse])
def list_enrichment_runs(member_id: str):
    runs = enrichment_service.get_runs_for_member(member_id)
    if runs is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return runs


@router.get("/{member_id}/enrichment-runs/{run_id}", response_model=EnrichmentRunResponse)
def get_enrichment_run(member_id: str, run_id: str):
    run = enrichment_service.get_run_by_id(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Enrichment run not found")
    if run["member_id"] != member_id:
        raise HTTPException(status_code=404, detail="Enrichment run not found")
    return run
