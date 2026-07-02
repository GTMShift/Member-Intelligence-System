import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/core/config";

const validEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  APOLLO_API_KEY: "apollo-key",
};

describe("loadConfig", () => {
  it("loads valid env vars", () => {
    const config = loadConfig(validEnv);
    expect(config.SUPABASE_URL).toBe(validEnv.SUPABASE_URL);
    expect(config.SUPABASE_ANON_KEY).toBe(validEnv.SUPABASE_ANON_KEY);
    expect(config.APOLLO_API_KEY).toBe(validEnv.APOLLO_API_KEY);
  });

  it("requires SUPABASE_ANON_KEY (not SUPABASE_KEY)", () => {
    const { SUPABASE_ANON_KEY, ...rest } = validEnv;
    expect(() => loadConfig(rest as unknown as NodeJS.ProcessEnv)).toThrow();
  });

  it("rejects missing APOLLO_API_KEY", () => {
    const { APOLLO_API_KEY, ...rest } = validEnv;
    expect(() => loadConfig(rest as unknown as NodeJS.ProcessEnv)).toThrow();
  });

  it("rejects malformed SUPABASE_URL", () => {
    expect(() =>
      loadConfig({ ...validEnv, SUPABASE_URL: "not-a-url" })
    ).toThrow();
  });
});
