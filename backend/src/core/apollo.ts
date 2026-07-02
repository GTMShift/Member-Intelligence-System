import { Config } from "./config";
import { ApolloPersonResponseSchema, ApolloPersonResponse } from "../schemas/enrichment";
import { UpstreamError } from "./errors";

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

export interface ApolloClient {
  fetchPersonByLinkedin(linkedinUrl: string): Promise<ApolloPersonResponse>;
  fetchPersonByEmail(email: string): Promise<ApolloPersonResponse>;
}

export function createApolloClient(config: Config): ApolloClient {
  async function post(body: Record<string, unknown>): Promise<ApolloPersonResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(`${APOLLO_BASE_URL}/people/match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "X-Api-Key": config.APOLLO_API_KEY,
        },
        body: JSON.stringify({ ...body, reveal_personal_emails: false }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      throw new UpstreamError(`Apollo API error: ${res.status}`, res.status);
    }
    const json = await res.json();
    return ApolloPersonResponseSchema.parse(json);
  }

  return {
    fetchPersonByLinkedin: (linkedin_url) => post({ linkedin_url }),
    fetchPersonByEmail: (email) => post({ email }),
  };
}
