import pytest
from pydantic import ValidationError

from app.schemas.enrichment import (
    ApolloEmploymentEntry,
    ApolloOrganization,
    ApolloPerson,
    ApolloPersonResponse,
    ApolloPhoneNumber,
    EnrichmentRunCreate,
    EnrichmentRunStatus,
    EnrichmentRunType,
    EnrichmentTriggerRequest,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

FULL_APOLLO_PAYLOAD = {
    "person": {
        "first_name": "Jane",
        "last_name": "Smith",
        "linkedin_url": "https://linkedin.com/in/janesmith",
        "email": "jane@acme.com",
        "email_status": "verified",
        "phone_numbers": [
            {"raw_number": "+15551234567", "sanitized_number": "+15551234567", "type": "work"}
        ],
        "title": "VP of Sales",
        "seniority": "vp",
        "city": "Austin",
        "state": "Texas",
        "country": "United States",
        "employment_history": [
            {
                "title": "VP of Sales",
                "organization_name": "Acme Corp",
                "start_date": "2022-01-01",
                "end_date": None,
                "current": True,
            },
            {
                "title": "Director of Sales",
                "organization_name": "Beta Inc",
                "start_date": "2019-03-01",
                "end_date": "2021-12-31",
                "current": False,
            },
        ],
        "organization": {
            "name": "Acme Corp",
            "website_url": "https://acme.com",
            "linkedin_url": "https://linkedin.com/company/acme",
            "primary_domain": "acme.com",
            "industry": "software",
            "estimated_num_employees": 500,
            "revenue_range": "10M-50M",
            "company_type": "private",
            "short_description": "Acme Corp makes widgets.",
            "city": "Austin",
            "state": "Texas",
            "country": "United States",
        },
    }
}


# ---------------------------------------------------------------------------
# Group 1 — Happy path and defaults
# ---------------------------------------------------------------------------

def test_full_apollo_response_parses():
    result = ApolloPersonResponse(**FULL_APOLLO_PAYLOAD)
    assert result.person is not None
    assert result.person.first_name == "Jane"
    assert result.person.seniority == "vp"
    assert result.person.organization.primary_domain == "acme.com"
    assert len(result.person.employment_history) == 2
    assert len(result.person.phone_numbers) == 1


def test_missing_optional_fields_default_to_none():
    result = ApolloPersonResponse(person={"first_name": "Jane", "last_name": "Smith"})
    p = result.person
    assert p.email is None
    assert p.seniority is None
    assert p.city is None
    assert p.state is None
    assert p.country is None
    assert p.title is None
    assert p.organization is None


def test_employment_history_defaults_to_empty_list():
    result = ApolloPersonResponse(person={"first_name": "Jane", "last_name": "Smith"})
    assert result.person.employment_history == []


def test_phone_numbers_defaults_to_empty_list():
    result = ApolloPersonResponse(person={"first_name": "Jane", "last_name": "Smith"})
    assert result.person.phone_numbers == []


def test_null_person_is_valid():
    result = ApolloPersonResponse(person=None)
    assert result.person is None


def test_null_organization_is_valid():
    result = ApolloPersonResponse(
        person={"first_name": "Jane", "last_name": "Smith", "organization": None}
    )
    assert result.person.organization is None


# ---------------------------------------------------------------------------
# Group 2 — Incorrect / bad / incomplete data
# ---------------------------------------------------------------------------

def test_unknown_extra_fields_are_ignored():
    payload = {
        "person": {
            "first_name": "Jane",
            "last_name": "Smith",
            "headline": "Top seller",          # Apollo field we don't model
            "twitter_url": "https://x.com/j",  # Apollo field we don't model
            "github_url": None,
        }
    }
    result = ApolloPersonResponse(**payload)
    assert result.person.first_name == "Jane"
    assert not hasattr(result.person, "headline")


def test_organization_missing_domain_is_valid():
    org = ApolloOrganization(name="Acme Corp", industry="software")
    assert org.primary_domain is None


def test_employment_entry_missing_title_is_valid():
    entry = ApolloEmploymentEntry(organization_name="Acme Corp")
    assert entry.title is None


def test_employment_entry_current_defaults_false():
    entry = ApolloEmploymentEntry(title="Engineer", organization_name="Acme Corp")
    assert entry.current is False


def test_estimated_employees_string_coercion():
    org = ApolloOrganization(name="Acme", primary_domain="acme.com", estimated_num_employees="500")
    assert org.estimated_num_employees == 500


# ---------------------------------------------------------------------------
# Group 3 — Enrichment run models: valid inputs
# ---------------------------------------------------------------------------

def test_enrichment_run_create_valid():
    run = EnrichmentRunCreate(
        member_id="00000000-0000-0000-0000-000000000001",
        run_type=EnrichmentRunType.manual,
        status=EnrichmentRunStatus.success,
    )
    assert run.fields_updated == {}
    assert run.fields_skipped == {}
    assert run.error_message is None


def test_enrichment_run_create_with_audit_dicts():
    run = EnrichmentRunCreate(
        member_id="00000000-0000-0000-0000-000000000001",
        run_type="manual",
        status="success",
        fields_updated={"city": "Austin", "seniority_level": "vp"},
        fields_skipped={"work_email_enriched": "already populated"},
    )
    assert run.fields_updated["city"] == "Austin"
    assert run.fields_skipped["work_email_enriched"] == "already populated"


def test_trigger_request_default_run_type():
    req = EnrichmentTriggerRequest(member_id="00000000-0000-0000-0000-000000000001")
    assert req.run_type == EnrichmentRunType.manual


# ---------------------------------------------------------------------------
# Group 4 — Enrichment run models: invalid inputs
# ---------------------------------------------------------------------------

def test_invalid_run_type_raises():
    with pytest.raises(ValidationError):
        EnrichmentRunCreate(
            member_id="00000000-0000-0000-0000-000000000001",
            run_type="weekly",
            status="success",
        )


def test_invalid_status_raises():
    with pytest.raises(ValidationError):
        EnrichmentRunCreate(
            member_id="00000000-0000-0000-0000-000000000001",
            run_type="manual",
            status="error",
        )


def test_enrichment_run_missing_member_id_raises():
    with pytest.raises(ValidationError):
        EnrichmentRunCreate(run_type="manual", status="success")


def test_trigger_missing_member_id_raises():
    with pytest.raises(ValidationError):
        EnrichmentTriggerRequest()
