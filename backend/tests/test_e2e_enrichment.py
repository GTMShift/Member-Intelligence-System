"""
End-to-end tests for the enrichment API surface.

All assertions are on HTTP responses — status codes, response body shape, and
observable outcomes. Supabase and Apollo are mocked at the module boundary so
no network calls are made, but the full FastAPI request/response cycle runs.
"""

from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.schemas.enrichment import ApolloPersonResponse, ApolloPerson, ApolloOrganization, ApolloEmploymentEntry


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def client():
    from main import app
    return TestClient(app)


def apollo_person(**kwargs) -> ApolloPersonResponse:
    """Build a minimal valid Apollo response. Override any field via kwargs."""
    defaults = dict(
        first_name="Jane",
        last_name="Smith",
        email="jane@acme.com",
        seniority="vp",
        city="Austin",
        state="Texas",
        country="United States",
        employment_history=[],
        organization=None,
    )
    defaults.update(kwargs)
    return ApolloPersonResponse(person=ApolloPerson(**defaults))


def mock_supabase_chain(returned_data: list | dict | None = None):
    """
    Return a MagicMock that satisfies common Supabase fluent-chain patterns:
    .table().select().eq().single().execute()
    .table().update().eq().execute()
    .table().insert().execute()
    .table().upsert().execute()
    .table().delete().eq().eq().execute()
    """
    m = MagicMock()
    execute = m.table.return_value.select.return_value.eq.return_value.single.return_value.execute
    execute.return_value.data = returned_data

    for method in ["update", "insert", "upsert", "delete"]:
        chain = getattr(m.table.return_value, method).return_value
        chain.eq.return_value.execute.return_value.data = [{}]
        chain.execute.return_value.data = [{}]

    m.table.return_value.upsert.return_value.execute.return_value.data = [{"id": "company-uuid"}]
    m.table.return_value.insert.return_value.execute.return_value.data = [{"id": "run-uuid"}]
    return m


# ---------------------------------------------------------------------------
# POST /members/{member_id}/enrich
# ---------------------------------------------------------------------------

@patch("app.api.enrichment.apollo_client")
@patch("app.api.enrichment.supabase")
@patch("app.services.enrichment_service.supabase")
def test_enrich_returns_200_with_run_id_on_success(mock_svc_sb, mock_api_sb, mock_apollo, client):
    """A complete enrichment returns 200, a run_id, and non-empty fields_updated."""
    mock_api_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "linkedin_url": "https://linkedin.com/in/jane", "email": "jane@acme.com"
    }
    mock_apollo.fetch_person_by_linkedin.return_value = apollo_person(seniority="vp", city="Austin")
    mock_svc_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]
    mock_svc_sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{}]
    mock_svc_sb.table.return_value.insert.return_value.execute.return_value.data = [{"id": "run-uuid"}]

    resp = client.post("/members/member-uuid/enrich", json={"member_id": "member-uuid", "run_type": "manual"})

    assert resp.status_code == 200
    body = resp.json()
    assert "run_id" in body
    assert body["status"] == "success"
    assert len(body["fields_updated"]) > 0


@patch("app.api.enrichment.supabase")
def test_enrich_unknown_member_returns_404(mock_sb, client):
    """Requesting enrichment for a member that doesn't exist returns 404."""
    mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    resp = client.post("/members/ghost-uuid/enrich", json={"member_id": "ghost-uuid", "run_type": "manual"})

    assert resp.status_code == 404


@patch("app.api.enrichment.supabase")
def test_enrich_member_with_no_identifiers_returns_422(mock_sb, client):
    """A member with no linkedin_url and no email cannot be looked up — API returns 422."""
    mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "linkedin_url": None, "email": None
    }

    resp = client.post("/members/member-uuid/enrich", json={"member_id": "member-uuid", "run_type": "manual"})

    assert resp.status_code == 422


@patch("app.api.enrichment.apollo_client")
@patch("app.api.enrichment.supabase")
@patch("app.services.enrichment_service.supabase")
def test_enrich_falls_back_to_email_when_no_linkedin(mock_svc_sb, mock_api_sb, mock_apollo, client):
    """When linkedin_url is absent, enrichment uses email to call Apollo."""
    mock_api_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "linkedin_url": None, "email": "jane@acme.com"
    }
    mock_apollo.fetch_person_by_email.return_value = apollo_person()
    mock_svc_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]
    mock_svc_sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{}]
    mock_svc_sb.table.return_value.insert.return_value.execute.return_value.data = [{"id": "run-uuid"}]

    resp = client.post("/members/member-uuid/enrich", json={"member_id": "member-uuid", "run_type": "manual"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "success"


@patch("app.api.enrichment.apollo_client")
@patch("app.api.enrichment.supabase")
def test_apollo_error_returns_502(mock_sb, mock_apollo, client):
    """When Apollo returns an HTTP error the API surfaces it as 502, not 500."""
    import httpx
    mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "linkedin_url": "https://linkedin.com/in/jane", "email": None
    }
    mock_apollo.fetch_person_by_linkedin.side_effect = httpx.HTTPStatusError(
        "upstream error", request=MagicMock(), response=MagicMock(status_code=429)
    )

    resp = client.post("/members/member-uuid/enrich", json={"member_id": "member-uuid", "run_type": "manual"})

    assert resp.status_code == 502


@patch("app.api.enrichment.apollo_client")
@patch("app.api.enrichment.supabase")
@patch("app.services.enrichment_service.supabase")
def test_apollo_returning_no_person_records_failed_run(mock_svc_sb, mock_api_sb, mock_apollo, client):
    """When Apollo finds no match, the run is recorded as failed (not an error crash)."""
    mock_api_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "linkedin_url": "https://linkedin.com/in/jane", "email": None
    }
    mock_apollo.fetch_person_by_linkedin.return_value = ApolloPersonResponse(person=None)
    mock_svc_sb.table.return_value.insert.return_value.execute.return_value.data = [{"id": "run-uuid"}]

    resp = client.post("/members/member-uuid/enrich", json={"member_id": "member-uuid", "run_type": "manual"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "failed"


@patch("app.api.enrichment.apollo_client")
@patch("app.api.enrichment.supabase")
@patch("app.services.enrichment_service.supabase")
def test_fields_skipped_when_apollo_returns_nulls(mock_svc_sb, mock_api_sb, mock_apollo, client):
    """Fields Apollo doesn't return appear in fields_skipped, not fields_updated."""
    mock_api_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "linkedin_url": "https://linkedin.com/in/jane", "email": None
    }
    mock_apollo.fetch_person_by_linkedin.return_value = apollo_person(
        seniority=None, city=None, state=None, country=None
    )
    mock_svc_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]
    mock_svc_sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{}]
    mock_svc_sb.table.return_value.insert.return_value.execute.return_value.data = [{"id": "run-uuid"}]

    resp = client.post("/members/member-uuid/enrich", json={"member_id": "member-uuid", "run_type": "manual"})

    body = resp.json()
    assert "seniority_level" not in body["fields_updated"]
    assert "seniority_level" in body["fields_skipped"]
    assert "city" in body["fields_skipped"]


@patch("app.api.enrichment.apollo_client")
@patch("app.api.enrichment.supabase")
@patch("app.services.enrichment_service.supabase")
def test_re_enriching_same_member_succeeds(mock_svc_sb, mock_api_sb, mock_apollo, client):
    """Running enrichment twice on the same member both return 200 (idempotent)."""
    mock_api_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "linkedin_url": "https://linkedin.com/in/jane", "email": None
    }
    mock_apollo.fetch_person_by_linkedin.return_value = apollo_person()
    mock_svc_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]
    mock_svc_sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{}]
    mock_svc_sb.table.return_value.insert.return_value.execute.return_value.data = [{"id": "run-uuid"}]

    payload = {"member_id": "member-uuid", "run_type": "manual"}
    first = client.post("/members/member-uuid/enrich", json=payload)
    second = client.post("/members/member-uuid/enrich", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200


# ---------------------------------------------------------------------------
# GET /members/{member_id}/enrichment-runs
# ---------------------------------------------------------------------------

@patch("app.services.enrichment_service.supabase")
def test_list_runs_returns_all_runs_for_member(mock_sb, client):
    """All runs for a member are returned in the list response."""
    mock_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
        {"id": "run-1", "member_id": "member-uuid", "status": "success", "run_type": "manual",
         "fields_updated": {}, "fields_skipped": {}, "error_message": None, "ran_at": "2026-06-27T00:00:00"},
        {"id": "run-2", "member_id": "member-uuid", "status": "failed", "run_type": "manual",
         "fields_updated": {}, "fields_skipped": {}, "error_message": "no data", "ran_at": "2026-06-26T00:00:00"},
    ]

    resp = client.get("/members/member-uuid/enrichment-runs")

    assert resp.status_code == 200
    assert len(resp.json()) == 2


@patch("app.services.enrichment_service.supabase")
def test_list_runs_returns_empty_list_when_no_runs_exist(mock_sb, client):
    """A member with no enrichment history returns an empty list, not a 404."""
    mock_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

    resp = client.get("/members/member-uuid/enrichment-runs")

    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# GET /members/{member_id}/enrichment-runs/{run_id}
# ---------------------------------------------------------------------------

@patch("app.services.enrichment_service.supabase")
def test_get_run_by_id_returns_full_run(mock_sb, client):
    """Fetching a specific run by ID returns its full data."""
    mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "id": "run-uuid", "member_id": "member-uuid", "status": "success", "run_type": "manual",
        "fields_updated": {"city": "Austin"}, "fields_skipped": {}, "error_message": None,
        "ran_at": "2026-06-27T00:00:00",
    }

    resp = client.get("/members/member-uuid/enrichment-runs/run-uuid")

    assert resp.status_code == 200
    assert resp.json()["id"] == "run-uuid"
    assert resp.json()["fields_updated"]["city"] == "Austin"


@patch("app.services.enrichment_service.supabase")
def test_get_run_not_found_returns_404(mock_sb, client):
    """A run ID that doesn't exist returns 404."""
    mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    resp = client.get("/members/member-uuid/enrichment-runs/ghost-run")

    assert resp.status_code == 404


@patch("app.services.enrichment_service.supabase")
def test_run_belonging_to_different_member_returns_404(mock_sb, client):
    """A run that exists but belongs to a different member returns 404, not 403."""
    mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "id": "run-uuid", "member_id": "other-member-uuid", "status": "success", "run_type": "manual",
        "fields_updated": {}, "fields_skipped": {}, "error_message": None, "ran_at": "2026-06-27T00:00:00",
    }

    resp = client.get("/members/member-uuid/enrichment-runs/run-uuid")

    assert resp.status_code == 404
