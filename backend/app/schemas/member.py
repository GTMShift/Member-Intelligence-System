from pydantic import BaseModel
from typing import Optional


class MemberBase(BaseModel):
    name: str
    email: str


class MemberCreate(MemberBase):
    pass


class MemberResponse(MemberBase):
    id: str

    class Config:
        from_attributes = True
