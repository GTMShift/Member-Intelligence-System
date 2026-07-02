import { Router } from "express";
import { EnrichmentTriggerRequestSchema } from "../schemas/enrichment";
import { MemberService } from "../services/memberService";
import { EnrichmentService } from "../services/enrichmentService";
import { ApolloClient } from "../core/apollo";
import { NotFoundError, ValidationError } from "../core/errors";

export function createEnrichmentRouter(deps: {
  memberService: MemberService;
  enrichmentService: EnrichmentService;
  apolloClient: ApolloClient;
}): Router {
  const router = Router();
  const { memberService, enrichmentService, apolloClient } = deps;

  router.post("/:memberId/enrich", async (req, res, next) => {
    try {
      const body = EnrichmentTriggerRequestSchema.parse(req.body);

      let member;
      try {
        member = await memberService.getMemberById(req.params.memberId);
      } catch (e) {
        if (e instanceof NotFoundError) throw new NotFoundError("Member not found");
        throw e;
      }

      const linkedinUrl = member.linkedin_url as string | null | undefined;
      const email = member.email as string | null | undefined;

      let apolloResponse;
      if (linkedinUrl) {
        apolloResponse = await apolloClient.fetchPersonByLinkedin(linkedinUrl);
      } else if (email) {
        apolloResponse = await apolloClient.fetchPersonByEmail(email);
      } else {
        throw new ValidationError("Member has no linkedin_url or email to look up in Apollo");
      }

      const run = await enrichmentService.enrichMember(
        req.params.memberId,
        apolloResponse,
        body.run_type
      );
      const persisted = await enrichmentService.persistRun(run);

      res.json({
        run_id: (persisted as { id: string }).id,
        status: run.status,
        fields_updated: run.fields_updated,
        fields_skipped: run.fields_skipped,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/:memberId/enrichment-runs", async (req, res, next) => {
    try {
      const runs = await enrichmentService.getRunsForMember(req.params.memberId);
      res.json(runs);
    } catch (e) {
      next(e);
    }
  });

  router.get("/:memberId/enrichment-runs/:runId", async (req, res, next) => {
    try {
      const run = await enrichmentService.getRunById(req.params.runId);
      if (!run) throw new NotFoundError("Enrichment run not found");
      if ((run as { member_id: string }).member_id !== req.params.memberId) {
        throw new NotFoundError("Enrichment run not found");
      }
      res.json(run);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
