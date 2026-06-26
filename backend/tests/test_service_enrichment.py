from unittest.mock import MagicMock, patch, call
import pytest

from app.schemas.enrichment import (
    ApolloEmploymentEntry,
    ApolloOrganization,
    ApolloPerson,
    ApolloPersonResponse,
    EnrichmentRunStatus,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_person(**kwargs) -> ApolloPersonResponse:
    defaults = {
        "first_name": "Jane",
        "last_name": "Smith",
        "seniority": "vp",
        "city": "Austin",
        "state": "Texas",
        "country": "United States",
        "employment_history": [],
        "organization": None,
    }
    defaults.update(kwargs)
    return ApolloPersonResponse(person=defaults)


def make_org(**kwargs) -> dict:
    defaults = {
        "name": "Acme Corp",
        "primary_domain": "acme.com",
        "industry": "software",
        "estimated_num_employees": 500,
        "revenue_range": "10M-50M",
        "company_type": "private",
        "short_description": "Makes widgets.",
    }
    defaults.update(kwargs)
    return defaults


# ---------------------------------------------------------------------------
# Group 5 — Service-level coupling logic (Supabase mocked)
# ---------------------------------------------------------------------------

@patch("app.services.enrichment_service.supabase")
def test_null_apollo_person_returns_failed_run(mock_sb):
    from app.services.enrichment_service import enrich_member

    apollo = ApolloPersonResponse(person=None)
    result = enrich_member("member-uuid-001", apollo)

    assert result.status == EnrichmentRunStatus.failed
    assert result.error_message is not None
    mock_sb.table.assert_not_called()


@patch("app.services.enrichment_service.supabase")
def test_seniority_written_when_present(mock_sb):
    from app.services.enrichment_service import enrich_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]
    mock_sb.table.return_value.upsert.return_value.execute.return_value.data = [{"id": "co-uuid"}]

    apollo = make_person(seniority="vp")
    result = enrich_member("member-uuid-001", apollo)

    assert result.fields_updated.get("seniority_level") == "vp"


@patch("app.services.enrichment_service.supabase")
def test_seniority_skipped_when_null(mock_sb):
    from app.services.enrichment_service import enrich_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]

    apollo = make_person(seniority=None)
    result = enrich_member("member-uuid-001", apollo)

    assert "seniority_level" not in result.fields_updated
    assert "seniority_level" in result.fields_skipped


@patch("app.services.enrichment_service.supabase")
def test_city_state_country_all_written(mock_sb):
    from app.services.enrichment_service import enrich_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]

    apollo = make_person(city="Austin", state="Texas", country="United States")
    result = enrich_member("member-uuid-001", apollo)

    assert result.fields_updated.get("city") == "Austin"
    assert result.fields_updated.get("state_region") == "Texas"
    assert result.fields_updated.get("country") == "United States"


@patch("app.services.enrichment_service.supabase")
def test_company_upsert_skipped_when_no_domain(mock_sb):
    from app.services.enrichment_service import enrich_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]

    org_no_domain = make_org(primary_domain=None)
    apollo = make_person(organization=org_no_domain)
    result = enrich_member("member-uuid-001", apollo)

    assert "company_id" not in result.fields_updated
    assert "company_id" in result.fields_skipped


@patch("app.services.enrichment_service.supabase")
def test_employment_history_rows_created(mock_sb):
    from app.services.enrichment_service import enrich_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]
    mock_sb.table.return_value.insert.return_value.execute.return_value.data = [{}]

    jobs = [
        {"title": "VP Sales", "organization_name": "Acme", "current": True, "start_date": "2022-01-01"},
        {"title": "Director", "organization_name": "Beta", "current": False, "start_date": "2019-01-01"},
        {"title": "Manager", "organization_name": "Gamma", "current": False, "start_date": "2016-01-01"},
    ]
    apollo = make_person(employment_history=jobs)
    result = enrich_member("member-uuid-001", apollo)

    assert result.fields_updated.get("employment_history") == 3


@patch("app.services.enrichment_service.supabase")
def test_current_job_sets_is_current_true(mock_sb):
    from app.services.enrichment_service import enrich_member

    inserted_rows = []

    def capture_insert(row):
        inserted_rows.append(row)
        m = MagicMock()
        m.execute.return_value.data = [{}]
        return m

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]
    mock_sb.table.return_value.insert.side_effect = capture_insert

    jobs = [{"title": "VP Sales", "organization_name": "Acme", "current": True, "start_date": "2022-01-01"}]
    apollo = make_person(employment_history=jobs)
    enrich_member("member-uuid-001", apollo)

    current_rows = [r for r in inserted_rows if r.get("is_current") is True]
    assert len(current_rows) == 1


@patch("app.services.enrichment_service.supabase")
def test_enriched_at_updated_on_success(mock_sb):
    from app.services.enrichment_service import enrich_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]

    apollo = make_person()
    result = enrich_member("member-uuid-001", apollo)

    assert result.status == EnrichmentRunStatus.success

    # Verify members table was updated (enriched_at)
    update_calls = [str(c) for c in mock_sb.table.call_args_list]
    assert any("members" in c for c in update_calls)
