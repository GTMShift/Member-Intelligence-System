import { z } from "zod";

export const ApolloPhoneNumberSchema = z.object({
  raw_number: z.string().nullable().optional(),
  sanitized_number: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
});

export const ApolloEmploymentEntrySchema = z.object({
  title: z.string().nullable().optional(),
  organization_name: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  current: z.boolean().default(false),
});
export type ApolloEmploymentEntry = z.infer<typeof ApolloEmploymentEntrySchema>;

export const ApolloOrganizationSchema = z.object({
  name: z.string().nullable().optional(),
  website_url: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  primary_domain: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  estimated_num_employees: z.coerce.number().int().nullable().optional(),
  revenue_range: z.string().nullable().optional(),
  company_type: z.string().nullable().optional(),
  short_description: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});
export type ApolloOrganization = z.infer<typeof ApolloOrganizationSchema>;

export const ApolloPersonSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  email_status: z.string().nullable().optional(),
  phone_numbers: z.array(ApolloPhoneNumberSchema).default([]),
  title: z.string().nullable().optional(),
  seniority: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  employment_history: z.array(ApolloEmploymentEntrySchema).default([]),
  organization: ApolloOrganizationSchema.nullable().optional(),
});
export type ApolloPerson = z.infer<typeof ApolloPersonSchema>;

export const ApolloPersonResponseSchema = z.object({
  person: ApolloPersonSchema.nullable().optional(),
});
export type ApolloPersonResponse = z.infer<typeof ApolloPersonResponseSchema>;

export const EnrichmentRunTypeSchema = z.enum(["initial", "scheduled", "manual"]);
export type EnrichmentRunType = z.infer<typeof EnrichmentRunTypeSchema>;

export const EnrichmentRunStatusSchema = z.enum(["success", "failed", "partial"]);
export type EnrichmentRunStatus = z.infer<typeof EnrichmentRunStatusSchema>;

export const EnrichmentRunCreateSchema = z.object({
  member_id: z.string(),
  run_type: EnrichmentRunTypeSchema,
  status: EnrichmentRunStatusSchema,
  fields_updated: z.record(z.unknown()).default({}),
  fields_skipped: z.record(z.unknown()).default({}),
  error_message: z.string().nullable().optional(),
});
export type EnrichmentRunCreate = z.infer<typeof EnrichmentRunCreateSchema>;

export const EnrichmentRunResponseSchema = EnrichmentRunCreateSchema.extend({
  id: z.string(),
  ran_at: z.string(),
});
export type EnrichmentRunResponse = z.infer<typeof EnrichmentRunResponseSchema>;

export const EnrichmentTriggerRequestSchema = z.object({
  member_id: z.string(),
  run_type: EnrichmentRunTypeSchema.default("manual"),
});
export type EnrichmentTriggerRequest = z.infer<typeof EnrichmentTriggerRequestSchema>;

export const EnrichmentTriggerResponseSchema = z.object({
  run_id: z.string(),
  status: EnrichmentRunStatusSchema,
  fields_updated: z.record(z.unknown()),
  fields_skipped: z.record(z.unknown()),
});
export type EnrichmentTriggerResponse = z.infer<typeof EnrichmentTriggerResponseSchema>;
