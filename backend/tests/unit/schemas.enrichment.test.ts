import { describe, it, expect } from "vitest";
import {
  ApolloPersonResponseSchema,
  ApolloOrganizationSchema,
  ApolloEmploymentEntrySchema,
  EnrichmentRunCreateSchema,
  EnrichmentTriggerRequestSchema,
} from "../../src/schemas/enrichment";

const FULL_APOLLO_PAYLOAD = {
  person: {
    first_name: "Jane",
    last_name: "Smith",
    linkedin_url: "https://linkedin.com/in/janesmith",
    email: "jane@acme.com",
    email_status: "verified",
    phone_numbers: [
      { raw_number: "+15551234567", sanitized_number: "+15551234567", type: "work" },
    ],
    title: "VP of Sales",
    seniority: "vp",
    city: "Austin",
    state: "Texas",
    country: "United States",
    employment_history: [
      {
        title: "VP of Sales",
        organization_name: "Acme Corp",
        start_date: "2022-01-01",
        end_date: null,
        current: true,
      },
      {
        title: "Director of Sales",
        organization_name: "Beta Inc",
        start_date: "2019-03-01",
        end_date: "2021-12-31",
        current: false,
      },
    ],
    organization: {
      name: "Acme Corp",
      website_url: "https://acme.com",
      linkedin_url: "https://linkedin.com/company/acme",
      primary_domain: "acme.com",
      industry: "software",
      estimated_num_employees: 500,
      revenue_range: "10M-50M",
      company_type: "private",
      short_description: "Acme Corp makes widgets.",
      city: "Austin",
      state: "Texas",
      country: "United States",
    },
  },
};

describe("ApolloPersonResponseSchema", () => {
  it("parses a full apollo response", () => {
    const result = ApolloPersonResponseSchema.parse(FULL_APOLLO_PAYLOAD);
    expect(result.person).not.toBeNull();
    expect(result.person?.first_name).toBe("Jane");
    expect(result.person?.seniority).toBe("vp");
    expect(result.person?.organization?.primary_domain).toBe("acme.com");
    expect(result.person?.employment_history).toHaveLength(2);
    expect(result.person?.phone_numbers).toHaveLength(1);
  });

  it("defaults missing optional fields to undefined", () => {
    const result = ApolloPersonResponseSchema.parse({
      person: { first_name: "Jane", last_name: "Smith" },
    });
    const p = result.person!;
    expect(p.email).toBeUndefined();
    expect(p.seniority).toBeUndefined();
    expect(p.city).toBeUndefined();
    expect(p.state).toBeUndefined();
    expect(p.country).toBeUndefined();
    expect(p.title).toBeUndefined();
    expect(p.organization).toBeUndefined();
  });

  it("defaults employment_history to empty list", () => {
    const result = ApolloPersonResponseSchema.parse({
      person: { first_name: "Jane", last_name: "Smith" },
    });
    expect(result.person?.employment_history).toEqual([]);
  });

  it("defaults phone_numbers to empty list", () => {
    const result = ApolloPersonResponseSchema.parse({
      person: { first_name: "Jane", last_name: "Smith" },
    });
    expect(result.person?.phone_numbers).toEqual([]);
  });

  it("treats null person as valid", () => {
    const result = ApolloPersonResponseSchema.parse({ person: null });
    expect(result.person).toBeNull();
  });

  it("treats null organization as valid", () => {
    const result = ApolloPersonResponseSchema.parse({
      person: { first_name: "Jane", last_name: "Smith", organization: null },
    });
    expect(result.person?.organization).toBeNull();
  });

  it("ignores unknown extra fields", () => {
    const payload = {
      person: {
        first_name: "Jane",
        last_name: "Smith",
        headline: "Top seller",
        twitter_url: "https://x.com/j",
        github_url: null,
      },
    };
    const result = ApolloPersonResponseSchema.parse(payload);
    expect(result.person?.first_name).toBe("Jane");
    expect((result.person as Record<string, unknown>).headline).toBeUndefined();
  });
});

describe("ApolloOrganizationSchema", () => {
  it("allows missing primary_domain", () => {
    const org = ApolloOrganizationSchema.parse({ name: "Acme Corp", industry: "software" });
    expect(org.primary_domain).toBeUndefined();
  });

  it("coerces string estimated_num_employees to number", () => {
    const org = ApolloOrganizationSchema.parse({
      name: "Acme",
      primary_domain: "acme.com",
      estimated_num_employees: "500",
    });
    expect(org.estimated_num_employees).toBe(500);
  });
});

describe("ApolloEmploymentEntrySchema", () => {
  it("allows missing title", () => {
    const entry = ApolloEmploymentEntrySchema.parse({ organization_name: "Acme Corp" });
    expect(entry.title).toBeUndefined();
  });

  it("defaults current to false", () => {
    const entry = ApolloEmploymentEntrySchema.parse({
      title: "Engineer",
      organization_name: "Acme Corp",
    });
    expect(entry.current).toBe(false);
  });
});

describe("EnrichmentRunCreateSchema", () => {
  it("parses valid run with defaults", () => {
    const run = EnrichmentRunCreateSchema.parse({
      member_id: "00000000-0000-0000-0000-000000000001",
      run_type: "manual",
      status: "success",
    });
    expect(run.fields_updated).toEqual({});
    expect(run.fields_skipped).toEqual({});
    expect(run.error_message).toBeUndefined();
  });

  it("parses run with audit dicts", () => {
    const run = EnrichmentRunCreateSchema.parse({
      member_id: "00000000-0000-0000-0000-000000000001",
      run_type: "manual",
      status: "success",
      fields_updated: { city: "Austin", seniority_level: "vp" },
      fields_skipped: { work_email_enriched: "already populated" },
    });
    expect(run.fields_updated.city).toBe("Austin");
    expect(run.fields_skipped.work_email_enriched).toBe("already populated");
  });

  it("rejects invalid run_type", () => {
    expect(() =>
      EnrichmentRunCreateSchema.parse({
        member_id: "00000000-0000-0000-0000-000000000001",
        run_type: "weekly",
        status: "success",
      })
    ).toThrow();
  });

  it("rejects invalid status", () => {
    expect(() =>
      EnrichmentRunCreateSchema.parse({
        member_id: "00000000-0000-0000-0000-000000000001",
        run_type: "manual",
        status: "error",
      })
    ).toThrow();
  });

  it("requires member_id", () => {
    expect(() =>
      EnrichmentRunCreateSchema.parse({ run_type: "manual", status: "success" })
    ).toThrow();
  });
});

describe("EnrichmentTriggerRequestSchema", () => {
  it("defaults run_type to manual", () => {
    const req = EnrichmentTriggerRequestSchema.parse({
      member_id: "00000000-0000-0000-0000-000000000001",
    });
    expect(req.run_type).toBe("manual");
  });

  it("requires member_id", () => {
    expect(() => EnrichmentTriggerRequestSchema.parse({})).toThrow();
  });
});
