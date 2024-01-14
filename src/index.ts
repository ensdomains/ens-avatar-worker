import { createCors, error } from "itty-router";
import { Router } from "itty-router/Router";
import { ValidatedRequest, validateChain } from "./chains";
import { handleGet } from "./get";
import { handlePut } from "./put";
import { Env } from "./types";

const { preflight, corsify } = createCors({
  origins: ["*"],
  methods: ["PUT", "GET", "HEAD", "OPTIONS"],
});

const router = Router();

router.all("*", preflight);
router.all("/:network/:name?", validateChain);
router.put<ValidatedRequest, [Env]>("/:network/:name?", handlePut);
router.get<ValidatedRequest, [Env]>("/:network/:name?", handleGet);
router.head<ValidatedRequest, [Env]>("/:network/:name?", handleGet);
router.options("/:network/:name?", () => new Response(null, { status: 204 }));

export default {
  fetch: async (request: Request, env: Env) =>
    router
      .handle(request, env)
      .catch((e) => {
        console.error("Caught error");
        console.error(e);
        return error(500, "Internal Server Error");
      })
      .then(corsify),
};
