import { describe, it, expect } from "vitest";
import { pickPresentKeys } from "../../src/middleware/validateBody";
import { MemberUpdateSchema } from "../../src/schemas/member";

describe("pickPresentKeys (exclude_unset parity)", () => {
  const allowedKeys = Object.keys(MemberUpdateSchema.shape) as (keyof typeof MemberUpdateSchema.shape)[];

  it("only sends explicitly-provided fields", () => {
    const raw = { phone: "555-9999" };
    const parsed = MemberUpdateSchema.parse(raw);
    const patch = pickPresentKeys(raw, parsed, allowedKeys);
    expect(patch).toEqual({ phone: "555-9999" });
    expect(patch.first_name).toBeUndefined();
    expect("first_name" in patch).toBe(false);
  });

  it("sends an empty object when nothing is provided", () => {
    const raw = {};
    const parsed = MemberUpdateSchema.parse(raw);
    const patch = pickPresentKeys(raw, parsed, allowedKeys);
    expect(patch).toEqual({});
  });

  it("keeps explicit null to clear a field", () => {
    const raw = { phone: null };
    const parsed = MemberUpdateSchema.parse(raw);
    const patch = pickPresentKeys(raw, parsed, allowedKeys);
    expect("phone" in patch).toBe(true);
    expect(patch.phone).toBeNull();
  });

  it("sends multiple fields at once", () => {
    const raw = { first_name: "Jane", last_name: "Doe", phone: "555-1234" };
    const parsed = MemberUpdateSchema.parse(raw);
    const patch = pickPresentKeys(raw, parsed, allowedKeys);
    expect(patch).toEqual({ first_name: "Jane", last_name: "Doe", phone: "555-1234" });
  });
});
