import { DbClient } from "../core/dbClient";
import { MemberCreate, MemberUpdate } from "../schemas/member";
import { NotFoundError } from "../core/errors";

export function createMemberService(db: DbClient) {
  return {
    async getAllMembers() {
      const { data, error } = await db.from("members").select("*");
      if (error) throw error;
      return data;
    },

    async getMemberById(memberId: string) {
      const { data, error } = await db.from("members").select("*").eq("id", memberId).single();
      if (error || !data) throw new NotFoundError("Member not found");
      return data;
    },

    async createMember(payload: MemberCreate) {
      const { data, error } = await db.from("members").insert(payload).select().single();
      if (error) throw error;
      return data;
    },

    async updateMember(memberId: string, patch: Partial<MemberUpdate>) {
      const { data, error } = await db
        .from("members")
        .update(patch)
        .eq("id", memberId)
        .select()
        .single();
      if (error || !data) throw new NotFoundError("Member not found");
      return data;
    },

    async deleteMember(memberId: string) {
      const { data, error } = await db
        .from("members")
        .delete()
        .eq("id", memberId)
        .select()
        .single();
      if (error || !data) throw new NotFoundError("Member not found");
      return data;
    },
  };
}

export type MemberService = ReturnType<typeof createMemberService>;
