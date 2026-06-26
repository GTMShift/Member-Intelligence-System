from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Apollo API response models (inbound boundary — shape Apollo returns to us)
# ---------------------------------------------------------------------------

class ApolloPhoneNumber(BaseModel):
    model_config = ConfigDict(extra="ignore")

    raw_number: str | None = None
    sanitized_number: str | None = None
    type: str | None = None  # "work" | "mobile" | "home"


class ApolloEmploymentEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = None
    organization_name: str | None = None
    start_date: str | None = None  # "YYYY-MM-DD" or "YYYY-01-01"
    end_date: str | None = None
    current: bool = False


class ApolloOrganization(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    website_url: str | None = None
    linkedin_url: str | None = None
    primary_domain: str | None = None       # upsert key → companies.domain
    industry: str | None = None             # → companies.industry
    estimated_num_employees: int | None = None  # → companies.size (bucketed)
    revenue_range: str | None = None        # → companies.revenue
    company_type: str | None = None         # → companies.company_type
    short_description: str | None = None    # → companies.overview
    city: str | None = None
    state: str | None = None
    country: str | None = None


class ApolloPerson(BaseModel):
    model_config = ConfigDict(extra="ignore")

    first_name: str | None = None
    last_name: str | None = None
    linkedin_url: str | None = None
    email: str | None = None
    email_status: str | None = None  # "verified" | "likely valid" | "invalid"
    phone_numbers: list[ApolloPhoneNumber] = []
    title: str | None = None         # current job title
    seniority: str | None = None     # "vp" | "director" | "manager" | "entry"
    city: str | None = None
    state: str | None = None
    country: str | None = None
    employment_history: list[ApolloEmploymentEntry] = []
    organization: ApolloOrganization | None = None


class ApolloPersonResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    person: ApolloPerson | None = None


# ---------------------------------------------------------------------------
# Enrichment run models (outbound — what we write to enrichment_runs table)
# ---------------------------------------------------------------------------

class EnrichmentRunType(str, Enum):
    initial = "initial"
    scheduled = "scheduled"
    manual = "manual"


class EnrichmentRunStatus(str, Enum):
    success = "success"
    failed = "failed"
    partial = "partial"


class EnrichmentRunCreate(BaseModel):
    member_id: str
    run_type: EnrichmentRunType
    status: EnrichmentRunStatus
    fields_updated: dict[str, Any] = {}
    fields_skipped: dict[str, Any] = {}
    error_message: str | None = None


class EnrichmentRunResponse(EnrichmentRunCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    ran_at: datetime


# ---------------------------------------------------------------------------
# API surface models (trigger request / response)
# ---------------------------------------------------------------------------

class EnrichmentTriggerRequest(BaseModel):
    member_id: str
    run_type: EnrichmentRunType = EnrichmentRunType.manual


class EnrichmentTriggerResponse(BaseModel):
    run_id: str
    status: EnrichmentRunStatus
    fields_updated: dict[str, Any]
    fields_skipped: dict[str, Any]
