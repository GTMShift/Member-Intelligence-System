import { DbClient } from "../core/dbClient";
import {
  ApolloOrganization,
  ApolloPersonResponse,
  EnrichmentRunCreate,
  EnrichmentRunType,
} from "../schemas/enrichment";

export function createEnrichmentService(db: DbClient) {
  async function upsertCompany(org: ApolloOrganization): Promise<string> {
    const row = {
      name: org.name,
      domain: org.primary_domain,
      linkedin_url: org.linkedin_url,
      industry: org.industry,
      overview: org.short_description,
      company_type: org.company_type,
      revenue: org.revenue_range,
    };
    const { data, error } = await db
      .from("companies")
      .upsert(row, { onConflict: "domain" })
      .select()
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async function enrichMember(
    memberId: string,
    apollo: ApolloPersonResponse,
    runType: EnrichmentRunType = "manual"
  ): Promise<EnrichmentRunCreate> {
    const person = apollo.person;

    if (!person) {
      return {
        member_id: memberId,
        run_type: runType,
        status: "failed",
        fields_updated: {},
        fields_skipped: {},
        error_message: "Apollo returned no person data for this member",
      };
    }

    const updated: Record<string, unknown> = {};
    const skipped: Record<string, unknown> = {};
    const profilePatch: Record<string, unknown> = {};

    if (person.seniority) {
      profilePatch.seniority_level = person.seniority;
      updated.seniority_level = person.seniority;
    } else {
      skipped.seniority_level = "apollo returned null";
    }

    if (person.city) {
      profilePatch.city = person.city;
      updated.city = person.city;
    } else {
      skipped.city = "apollo returned null";
    }

    if (person.state) {
      profilePatch.state_region = person.state;
      updated.state_region = person.state;
    } else {
      skipped.state_region = "apollo returned null";
    }

    if (person.country) {
      profilePatch.country = person.country;
      updated.country = person.country;
    } else {
      skipped.country = "apollo returned null";
    }

    if (person.email) {
      profilePatch.work_email_enriched = person.email;
      updated.work_email_enriched = person.email;
    } else {
      skipped.work_email_enriched = "apollo returned null";
    }

    if (person.organization && person.organization.primary_domain) {
      const companyId = await upsertCompany(person.organization);
      profilePatch.company_id = companyId;
      updated.company_id = companyId;
    } else {
      skipped.company_id = "apollo organization missing domain";
    }

    await db
      .from("employment_history")
      .delete()
      .eq("member_id", memberId)
      .eq("source", "Apollo");

    let currentJob: (typeof person.employment_history)[number] | null = null;
    for (const job of person.employment_history) {
      const row = {
        member_id: memberId,
        company: job.organization_name || "",
        role: job.title,
        start_date: job.start_date,
        end_date: job.end_date,
        is_current: job.current,
        source: "Apollo",
      };
      await db.from("employment_history").insert(row);
      if (job.current) {
        currentJob = job;
      }
    }

    updated.employment_history = person.employment_history.length;

    if (currentJob && currentJob.start_date) {
      profilePatch.current_job_start_date = currentJob.start_date;
      updated.current_job_start_date = currentJob.start_date;
    }

    if (Object.keys(profilePatch).length > 0) {
      await db.from("member_profile").update(profilePatch).eq("member_id", memberId);
    }

    await db
      .from("members")
      .update({ enriched_at: new Date().toISOString() })
      .eq("id", memberId);

    return {
      member_id: memberId,
      run_type: runType,
      status: "success",
      fields_updated: updated,
      fields_skipped: skipped,
    };
  }

  async function persistRun(run: EnrichmentRunCreate) {
    const { data, error } = await db.from("enrichment_runs").insert(run).select().single();
    if (error) throw error;
    return data;
  }

  async function getRunsForMember(memberId: string) {
    const { data, error } = await db
      .from("enrichment_runs")
      .select("*")
      .eq("member_id", memberId)
      .order("ran_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async function getRunById(runId: string) {
    const { data } = await db.from("enrichment_runs").select("*").eq("id", runId).single();
    return data ?? null;
  }

  return { enrichMember, persistRun, getRunsForMember, getRunById };
}

export type EnrichmentService = ReturnType<typeof createEnrichmentService>;
