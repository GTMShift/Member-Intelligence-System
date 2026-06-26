from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class MemberCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    linkedin_url: str
    phone: str | None = None
    record_source: str | None = None  # 'Framer' | 'Luma' | 'Substack' | 'Manual'


class MemberUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    linkedin_url: str | None = None
    phone: str | None = None
    record_source: str | None = None


class MemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    first_name: str
    last_name: str
    email: str
    linkedin_url: str
    phone: str | None = None
    record_source: str | None = None
