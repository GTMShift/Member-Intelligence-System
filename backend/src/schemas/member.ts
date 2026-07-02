import { z } from "zod";

export const MemberCreateSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
  linkedin_url: z.string(),
  phone: z.string().nullable().optional(),
  record_source: z.string().nullable().optional(),
});
export type MemberCreate = z.infer<typeof MemberCreateSchema>;

export const MemberUpdateSchema = MemberCreateSchema.partial();
export type MemberUpdate = z.infer<typeof MemberUpdateSchema>;

export const MemberResponseSchema = MemberCreateSchema.extend({
  id: z.string(),
});
export type MemberResponse = z.infer<typeof MemberResponseSchema>;
