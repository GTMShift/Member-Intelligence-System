import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { createFakeSupabaseClient, FakeSupabaseClient } from "../helpers/fakeSupabase";
import { createMemberService } from "../../src/services/memberService";
import { createEnrichmentService } from "../../src/services/enrichmentService";
import { ApolloClient } from "../../src/core/apollo";
import { Application } from "express";

function makeApp(db: FakeSupabaseClient, apolloClient: ApolloClient): Application {
  return createApp({
    memberService: createMemberService(db),
    enrichmentService: createEnrichmentService(db),
    apolloClient,
    allowedOrigins: ["http://localhost:3000"],
  });
}

const noopApollo: ApolloClient = {
  fetchPersonByLinkedin: async () => ({ person: null }),
  fetchPersonByEmail: async () => ({ person: null }),
};

describe("members API", () => {
  let db: FakeSupabaseClient;
  let app: Application;

  beforeEach(() => {
    db = createFakeSupabaseClient();
    db.seed("members", [
      {
        id: "uuid-1",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.com",
        linkedin_url: "https://linkedin.com/in/jane",
      },
    ]);
    app = makeApp(db, noopApollo);
  });

  it("GET / returns status ok", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /members lists all members", async () => {
    const res = await request(app).get("/members");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /members/:id returns a single member", async () => {
    const res = await request(app).get("/members/uuid-1");
    expect(res.status).toBe(200);
    expect(res.body.first_name).toBe("Jane");
  });

  it("GET /members/:id returns 404 for unknown member", async () => {
    const res = await request(app).get("/members/missing");
    expect(res.status).toBe(404);
  });

  it("POST /members creates a member and returns 201", async () => {
    const res = await request(app).post("/members").send({
      first_name: "New",
      last_name: "Person",
      email: "new@example.com",
      linkedin_url: "https://linkedin.com/in/new",
    });
    expect(res.status).toBe(201);
    expect(res.body.first_name).toBe("New");
  });

  it("POST /members returns 422 on invalid body", async () => {
    const res = await request(app).post("/members").send({ first_name: "OnlyFirst" });
    expect(res.status).toBe(422);
  });

  it("PATCH /members/:id updates only provided fields", async () => {
    const res = await request(app).patch("/members/uuid-1").send({ phone: "555-9999" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("555-9999");
    expect(res.body.first_name).toBe("Jane");
  });

  it("PATCH /members/:id returns 404 for unknown member", async () => {
    const res = await request(app).patch("/members/missing").send({ phone: "555-9999" });
    expect(res.status).toBe(404);
  });

  it("DELETE /members/:id deletes and returns 204", async () => {
    const res = await request(app).delete("/members/uuid-1");
    expect(res.status).toBe(204);
    const list = await request(app).get("/members");
    expect(list.body).toHaveLength(0);
  });

  it("DELETE /members/:id returns 404 for unknown member", async () => {
    const res = await request(app).delete("/members/missing");
    expect(res.status).toBe(404);
  });
});
