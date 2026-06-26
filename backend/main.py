from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import members

app = FastAPI(title="Member Intelligence System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(members.router)


@app.get("/")
def root():
    return {"status": "ok"}
