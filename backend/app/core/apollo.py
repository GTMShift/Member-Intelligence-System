import httpx

from app.core.config import settings
from app.schemas.enrichment import ApolloPersonResponse

APOLLO_BASE_URL = "https://api.apollo.io/api/v1"


def _headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": settings.apollo_api_key,
    }


def fetch_person_by_linkedin(linkedin_url: str) -> ApolloPersonResponse:
    response = httpx.post(
        f"{APOLLO_BASE_URL}/people/match",
        headers=_headers(),
        json={"linkedin_url": linkedin_url, "reveal_personal_emails": False},
        timeout=15,
    )
    response.raise_for_status()
    return ApolloPersonResponse(**response.json())


def fetch_person_by_email(email: str) -> ApolloPersonResponse:
    response = httpx.post(
        f"{APOLLO_BASE_URL}/people/match",
        headers=_headers(),
        json={"email": email, "reveal_personal_emails": False},
        timeout=15,
    )
    response.raise_for_status()
    return ApolloPersonResponse(**response.json())
