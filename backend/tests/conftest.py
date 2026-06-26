import os

# Must be set before any app module is imported — pydantic-settings reads them at class definition time.
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_KEY", "test-anon-key")
