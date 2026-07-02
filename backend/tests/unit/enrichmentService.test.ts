import { describe, it, expect, beforeEach } from "vitest";
import { createFakeSupabaseClient, FakeSupabaseClient } from "../helpers/fakeSupabase";
import { createEnrichmentService, EnrichmentService } from "../../src/services/enrichmentService";
import { ApolloPersonResponse } from "../../src/schemas/enrichment";

function makePerson(overrides: Partial<ApolloPersonResponse["person"]> = {}): ApolloPersonResponse {
  return {
    person: {
      first_name: "Jane",
      last_name: "Smith",
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

describe("enrichmentService.enrichMember", () => {
  let db: FakeSupabaseClient;
  let service: EnrichmentService;

  beforeEach(() => {
    db = createFakeSupabaseClient();
    service = createEnrichmentService(db);
  });

  it("returns a failed run and makes zero db calls when person is null", async () => {
    const result = await service.enrichMember("member-uuid-001", { person: null });
    expect(result.status).toBe("failed");
    expect(result.error_message).toBeTruthy();
    expect(db.calls).toHaveLength(0);
  });

  it("writes seniority when present", async () => {
    const result = await service.enrichMember("member-uuid-001", makePerson({ seniority: "vp" }));
    expect(result.fields_updated.seniority_level).toBe("vp");
  });

  it("skips seniority when null", async () => {
    const result = await service.enrichMember("member-uuid-001", makePerson({ seniority: null }));
    expect(result.fields_updated.seniority_level).toBeUndefined();
    expect(result.fields_skipped.seniority_level).toBeDefined();
  });

  it("writes city, state_region, country", async () => {
    const result = await service.enrichMember(
      "member-uuid-001",
      makePerson({ city: "Austin", state: "Texas", country: "United States" })
    );
    expect(result.fields_updated.city).toBe("Austin");
    expect(result.fields_updated.state_region).toBe("Texas");
    expect(result.fields_updated.country).toBe("United States");
  });

  it("skips company upsert when organization has no domain", async () => {
    const result = await service.enrichMember(
      "member-uuid-001",
      makePerson({ organization: { name: "Acme Corp", primary_domain: null } as any })
    );
    expect(result.fields_updated.company_id).toBeUndefined();
    expect(result.fields_skipped.company_id).toBeDefined();
  });

  it("upserts company when organization has a domain", async () => {
    const result = await service.enrichMember(
      "member-uuid-001",
      makePerson({ organization: { name: "Acme Corp", primary_domain: "acme.com" } as any })
    );
    expect(result.fields_updated.company_id).toBeDefined();
    expect(db.getRows("companies")).toHaveLength(1);
  });

  it("creates employment history rows and counts them", async () => {
    const jobs = [
      { title: "VP Sales", organization_name: "Acme", current: true, start_date: "2022-01-01" },
      { title: "Director", organization_name: "Beta", current: false, start_date: "2019-01-01" },
      { title: "Manager", organization_name: "Gamma", current: false, start_date: "2016-01-01" },
    ];
    const result = await service.enrichMember(
      "member-uuid-001",
      makePerson({ employment_history: jobs as any })
    );
    expect(result.fields_updated.employment_history).toBe(3);
    expect(db.getRows("employment_history")).toHaveLength(3);
  });

  it("marks the current job as is_current true", async () => {
    const jobs = [
      { title: "VP Sales", organization_name: "Acme", current: true, start_date: "2022-01-01" },
    ];
    await service.enrichMember("member-uuid-001", makePerson({ employment_history: jobs as any }));
    const rows = db.getRows("employment_history");
    const currentRows = rows.filter((r) => r.is_current === true);
    expect(currentRows).toHaveLength(1);
  });

  it("is idempotent: re-enrichment replaces prior Apollo employment history rows", async () => {
    const jobs1 = [{ title: "VP Sales", organization_name: "Acme", current: true, start_date: "2022-01-01" }];
    await service.enrichMember("member-uuid-001", makePerson({ employment_history: jobs1 as any }));
    expect(db.getRows("employment_history")).toHaveLength(1);

    const jobs2 = [
      { title: "VP Sales", organization_name: "Acme", current: true, start_date: "2022-01-01" },
      { title: "Director", organization_name: "Beta", current: false, start_date: "2019-01-01" },
    ];
    await service.enrichMember("member-uuid-001", makePerson({ employment_history: jobs2 as any }));
    expect(db.getRows("employment_history")).toHaveLength(2);
  });

  it("updates members.enriched_at on success", async () => {
    db.seed("members", [{ id: "member-uuid-001" }]);
    const result = await service.enrichMember("member-uuid-001", makePerson());
    expect(result.status).toBe("success");
    const member = db.getRows("members")[0];
    expect(member.enriched_at).toBeDefined();
  });
});

describe("enrichmentService.persistRun / getRunsForMember / getRunById", () => {
  let db: FakeSupabaseClient;
  let service: EnrichmentService;

  beforeEach(() => {
    db = createFakeSupabaseClient();
    service = createEnrichmentService(db);
  });

  it("persists a run and returns it with an id", async () => {
    const persisted = await service.persistRun({
      member_id: "member-uuid-001",
      run_type: "manual",
      status: "success",
      fields_updated: {},
      fields_skipped: {},
    });
    expect(persisted.id).toBeDefined();
  });

  it("lists runs for a member ordered by ran_at desc", async () => {
    db.seed("enrichment_runs", [
      { id: "run-1", member_id: "member-uuid-001", ran_at: "2024-01-01T00:00:00.000Z" },
      { id: "run-2", member_id: "member-uuid-001", ran_at: "2024-02-01T00:00:00.000Z" },
    ]);
    const runs = await service.getRunsForMember("member-uuid-001");
    expect(runs).toHaveLength(2);
    expect(runs[0].id).toBe("run-2");
  });

  it("gets a run by id", async () => {
    db.seed("enrichment_runs", [{ id: "run-1", member_id: "member-uuid-001" }]);
    const run = await service.getRunById("run-1");
    expect(run?.id).toBe("run-1");
  });

  it("returns null for a missing run", async () => {
    const run = await service.getRunById("missing");
    expect(run).toBeNull();
  });
});
