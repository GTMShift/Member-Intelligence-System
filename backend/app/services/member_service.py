from app.core.db import supabase
from app.schemas.member import MemberCreate


def get_all_members():
    response = supabase.table("members").select("*").execute()
    return response.data


def get_member_by_id(member_id: str):
    response = supabase.table("members").select("*").eq("id", member_id).single().execute()
    return response.data


def create_member(payload: MemberCreate):
    response = supabase.table("members").insert(payload.model_dump()).execute()
    return response.data[0]
