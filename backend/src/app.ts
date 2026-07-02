import express, { Application } from "express";
import cors from "cors";
import { MemberService } from "./services/memberService";
import { EnrichmentService } from "./services/enrichmentService";
import { ApolloClient } from "./core/apollo";
import { createMembersRouter } from "./api/members";
import { createEnrichmentRouter } from "./api/enrichment";
import { errorHandler } from "./middleware/errorHandler";

export interface AppDeps {
  memberService: MemberService;
  enrichmentService: EnrichmentService;
  apolloClient: ApolloClient;
  allowedOrigins?: string[];
}

export function createApp(deps: AppDeps): Application {
  const app = express();
  app.use(express.json());
  app.use(
    cors({
      origin: deps.allowedOrigins && deps.allowedOrigins.length ? deps.allowedOrigins : false,
      credentials: true,
    })
  );

  app.get("/", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/members", createMembersRouter(deps));
  app.use("/members", createEnrichmentRouter(deps));

  app.use(errorHandler);

  return app;
}
