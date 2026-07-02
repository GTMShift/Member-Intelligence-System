import { Router } from "express";
import { MemberCreateSchema, MemberUpdateSchema, MemberUpdate } from "../schemas/member";
import { MemberService } from "../services/memberService";
import { pickPresentKeys } from "../middleware/validateBody";

const MEMBER_UPDATE_KEYS = Object.keys(MemberUpdateSchema.shape) as (keyof MemberUpdate)[];

export function createMembersRouter(deps: { memberService: MemberService }): Router {
  const router = Router();
  const { memberService } = deps;

  router.get("/", async (_req, res, next) => {
    try {
      res.json(await memberService.getAllMembers());
    } catch (e) {
      next(e);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      res.json(await memberService.getMemberById(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const payload = MemberCreateSchema.parse(req.body);
      res.status(201).json(await memberService.createMember(payload));
    } catch (e) {
      next(e);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const parsed = MemberUpdateSchema.parse(req.body);
      const patch = pickPresentKeys(req.body, parsed, MEMBER_UPDATE_KEYS);
      res.json(await memberService.updateMember(req.params.id, patch));
    } catch (e) {
      next(e);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      await memberService.deleteMember(req.params.id);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
