import { loadConfig } from "./core/config";
import { createSupabaseClient } from "./core/db";
import { createApolloClient } from "./core/apollo";
import { createMemberService } from "./services/memberService";
import { createEnrichmentService } from "./services/enrichmentService";
import { createApp } from "./app";

const config = loadConfig();
const db = createSupabaseClient(config);

const app = createApp({
  memberService: createMemberService(db),
  enrichmentService: createEnrichmentService(db),
  apolloClient: createApolloClient(config),
  allowedOrigins: (config.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
});

const port = process.env.PORT ? Number(process.env.PORT) : 8000;
app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
