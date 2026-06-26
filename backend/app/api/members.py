from fastapi import APIRouter
from app.schemas.member import MemberCreate, MemberResponse
from app.services import member_service

router = APIRouter(prefix="/members", tags=["members"])


@router.get("/", response_model=list[MemberResponse])
def list_members():
    return member_service.get_all_members()


@router.get("/{member_id}", response_model=MemberResponse)
def get_member(member_id: str):
    return member_service.get_member_by_id(member_id)


@router.post("/", response_model=MemberResponse, status_code=201)
def create_member(payload: MemberCreate):
    return member_service.create_member(payload)
