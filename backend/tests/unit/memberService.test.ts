import { describe, it, expect, beforeEach } from "vitest";
import { createFakeSupabaseClient, FakeSupabaseClient } from "../helpers/fakeSupabase";
import { createMemberService, MemberService } from "../../src/services/memberService";
import { NotFoundError } from "../../src/core/errors";

describe("memberService", () => {
  let db: FakeSupabaseClient;
  let service: MemberService;

  beforeEach(() => {
    db = createFakeSupabaseClient();
    db.seed("members", [
      { id: "uuid-1", first_name: "Jane", last_name: "Doe", email: "jane@example.com", linkedin_url: "https://linkedin.com/in/jane" },
    ]);
    service = createMemberService(db);
  });

  it("gets all members", async () => {
    const members = await service.getAllMembers();
    expect(members).toHaveLength(1);
  });

  it("gets a member by id", async () => {
    const member = await service.getMemberById("uuid-1");
    expect(member.first_name).toBe("Jane");
  });

  it("throws NotFoundError for missing member", async () => {
    await expect(service.getMemberById("missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creates a member", async () => {
    const created = await service.createMember({
      first_name: "New",
      last_name: "Person",
      email: "new@example.com",
      linkedin_url: "https://linkedin.com/in/new",
    });
    expect(created.first_name).toBe("New");
    expect(created.id).toBeDefined();
  });

  it("updates only the provided fields", async () => {
    const updated = await service.updateMember("uuid-1", { phone: "555-9999" });
    expect(updated.phone).toBe("555-9999");
    expect(updated.first_name).toBe("Jane");
  });

  it("throws NotFoundError updating a missing member", async () => {
    await expect(service.updateMember("missing", { phone: "555-0000" })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("deletes a member", async () => {
    await service.deleteMember("uuid-1");
    const remaining = await service.getAllMembers();
    expect(remaining).toHaveLength(0);
  });

  it("throws NotFoundError deleting a missing member", async () => {
    await expect(service.deleteMember("missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
