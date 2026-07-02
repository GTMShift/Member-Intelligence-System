import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { createFakeSupabaseClient, FakeSupabaseClient } from "../helpers/fakeSupabase";
import { createMemberService } from "../../src/services/memberService";
import { createEnrichmentService } from "../../src/services/enrichmentService";
import { ApolloClient } from "../../src/core/apollo";
import { ApolloPersonResponse } from "../../src/schemas/enrichment";
import { UpstreamError } from "../../src/core/errors";
import { Application } from "express";

function makeApp(db: FakeSupabaseClient, apolloClient: ApolloClient): Application {
  return createApp({
    memberService: createMemberService(db),
    enrichmentService: createEnrichmentService(db),
    apolloClient,
    allowedOrigins: ["http://localhost:3000"],
  });
}

function apolloPerson(overrides: Record<string, unknown> = {}): ApolloPersonResponse {
  return {
    person: {
      first_name: "Jane",
      last_name: "Smith",
      email: "jane@acme.com",
      seniority: "vp",
      city: "Austin",
      state: "Texas",
      country: "United States",
      employment_history: [],
      phone_numbers: [],
      organization: null,
      ...overrides,
    } as ApolloPersonResponse["person"],
  };
}

describe("enrichment API", () => {
  let db: FakeSupabaseClient;

  beforeEach(() => {
    db = createFakeSupabaseClient();
  });

  it("returns 200 with run_id on success", async () => {
    db.seed("members", [
      { id: "member-uuid", linkedin_url: "https://linkedin.com/in/jane", email: "jane@acme.com" },
    ]);
    const apolloClient: ApolloClient = {
      fetchPersonByLinkedin: async () => apolloPerson({ seniority: "vp", city: "Austin" }),
      fetchPersonByEmail: async () => apolloPerson(),
    };
    const app = makeApp(db, apolloClient);

    const res = await request(app)
      .post("/members/member-uuid/enrich")
      .send({ member_id: "member-uuid", run_type: "manual" });

    expect(res.status).toBe(200);
    expect(res.body.run_id).toBeDefined();
    expect(res.body.status).toBe("success");
    expect(Object.keys(res.body.fields_updated).length).toBeGreaterThan(0);
  });

  it("returns 404 for unknown member", async () => {
    const app = makeApp(db, {
      fetchPersonByLinkedin: async () => apolloPerson(),
      fetchPersonByEmail: async () => apolloPerson(),
    });

    const res = await request(app)
      .post("/members/ghost-uuid/enrich")
      .send({ member_id: "ghost-uuid", run_type: "manual" });

    expect(res.status).toBe(404);
  });

  it("returns 422 when member has no linkedin_url or email", async () => {
    db.seed("members", [{ id: "member-uuid", linkedin_url: null, email: null }]);
    const app = makeApp(db, {
      fetchPersonByLinkedin: async () => apolloPerson(),
      fetchPersonByEmail: async () => apolloPerson(),
    });

    const res = await request(app)
      .post("/members/member-uuid/enrich")
      .send({ member_id: "member-uuid", run_type: "manual" });

    expect(res.status).toBe(422);
  });

  it("falls back to email when no linkedin_url is present", async () => {
    db.seed("members", [{ id: "member-uuid", linkedin_url: null, email: "jane@acme.com" }]);
    let usedEmail = false;
    const app = makeApp(db, {
      fetchPersonByLinkedin: async () => apolloPerson(),
      fetchPersonByEmail: async () => {
        usedEmail = true;
        return apolloPerson();
      },
    });

    const res = await request(app)
      .post("/members/member-uuid/enrich")
      .send({ member_id: "member-uuid", run_type: "manual" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(usedEmail).toBe(true);
  });

  it("returns 502 when Apollo returns an HTTP error", async () => {
    db.seed("members", [
      { id: "member-uuid", linkedin_url: "https://linkedin.com/in/jane", email: null },
    ]);
    const app = makeApp(db, {
      fetchPersonByLinkedin: async () => {
        throw new UpstreamError("Apollo API error: 429", 429);
      },
      fetchPersonByEmail: async () => apolloPerson(),
    });

    const res = await request(app)
      .post("/members/member-uuid/enrich")
      .send({ member_id: "member-uuid", run_type: "manual" });

    expect(res.status).toBe(502);
  });

  it("records a failed run (200) when Apollo returns no person", async () => {
    db.seed("members", [
      { id: "member-uuid", linkedin_url: "https://linkedin.com/in/jane", email: null },
    ]);
    const app = makeApp(db, {
      fetchPersonByLinkedin: async () => ({ person: null }),
      fetchPersonByEmail: async () => apolloPerson(),
    });

    const res = await request(app)
      .post("/members/member-uuid/enrich")
      .send({ member_id: "member-uuid", run_type: "manual" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("failed");
  });

  it("puts null apollo fields into fields_skipped", async () => {
    db.seed("members", [
      { id: "member-uuid", linkedin_url: "https://linkedin.com/in/jane", email: null },
    ]);
    const app = makeApp(db, {
      fetchPersonByLinkedin: async () =>
        apolloPerson({ seniority: null, city: null, state: null, country: null }),
      fetchPersonByEmail: async () => apolloPerson(),
    });

    const res = await request(app)
      .post("/members/member-uuid/enrich")
      .send({ member_id: "member-uuid", run_type: "manual" });

    expect(res.body.fields_updated.seniority_level).toBeUndefined();
    expect(res.body.fields_skipped.seniority_level).toBeDefined();
    expect(res.body.fields_skipped.city).toBeDefined();
  });

  it("allows re-enriching the same member twice (idempotent)", async () => {
    db.seed("members", [
      { id: "member-uuid", linkedin_url: "https://linkedin.com/in/jane", email: null },
    ]);
    const app = makeApp(db, {
      fetchPersonByLinkedin: async () => apolloPerson(),
      fetchPersonByEmail: async () => apolloPerson(),
    });

    const payload = { member_id: "member-uuid", run_type: "manual" };
    const first = await request(app).post("/members/member-uuid/enrich").send(payload);
    const second = await request(app).post("/members/member-uuid/enrich").send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("GET /members/:id/enrichment-runs returns all runs for a member", async () => {
    db.seed("enrichment_runs", [
      { id: "run-1", member_id: "member-uuid", status: "success", run_type: "manual", fields_updated: {}, fields_skipped: {}, ran_at: "2026-06-27T00:00:00" },
      { id: "run-2", member_id: "member-uuid", status: "failed", run_type: "manual", fields_updated: {}, fields_skipped: {}, ran_at: "2026-06-26T00:00:00" },
    ]);
    const app = makeApp(db, { fetchPersonByLinkedin: async () => apolloPerson(), fetchPersonByEmail: async () => apolloPerson() });

    const res = await request(app).get("/members/member-uuid/enrichment-runs");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("GET /members/:id/enrichment-runs returns empty list, not 404, when no runs exist", async () => {
    const app = makeApp(db, { fetchPersonByLinkedin: async () => apolloPerson(), fetchPersonByEmail: async () => apolloPerson() });

    const res = await request(app).get("/members/member-uuid/enrichment-runs");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("GET /members/:id/enrichment-runs/:runId returns the full run", async () => {
    db.seed("enrichment_runs", [
      { id: "run-uuid", member_id: "member-uuid", status: "success", run_type: "manual", fields_updated: { city: "Austin" }, fields_skipped: {}, ran_at: "2026-06-27T00:00:00" },
    ]);
    const app = makeApp(db, { fetchPersonByLinkedin: async () => apolloPerson(), fetchPersonByEmail: async () => apolloPerson() });

    const res = await request(app).get("/members/member-uuid/enrichment-runs/run-uuid");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("run-uuid");
    expect(res.body.fields_updated.city).toBe("Austin");
  });

  it("GET /members/:id/enrichment-runs/:runId returns 404 for missing run", async () => {
    const app = makeApp(db, { fetchPersonByLinkedin: async () => apolloPerson(), fetchPersonByEmail: async () => apolloPerson() });

    const res = await request(app).get("/members/member-uuid/enrichment-runs/ghost-run");
    expect(res.status).toBe(404);
  });

  it("GET /members/:id/enrichment-runs/:runId returns 404 when run belongs to a different member", async () => {
    db.seed("enrichment_runs", [
      { id: "run-uuid", member_id: "other-member-uuid", status: "success", run_type: "manual", fields_updated: {}, fields_skipped: {}, ran_at: "2026-06-27T00:00:00" },
    ]);
    const app = makeApp(db, { fetchPersonByLinkedin: async () => apolloPerson(), fetchPersonByEmail: async () => apolloPerson() });

    const res = await request(app).get("/members/member-uuid/enrichment-runs/run-uuid");
    expect(res.status).toBe(404);
  });
});
