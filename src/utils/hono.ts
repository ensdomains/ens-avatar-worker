import { Hono } from "hono/tiny";
import type { Context } from "hono";
import type { Env as HonoEnv } from "hono/types";

export type BaseEnv = {
  Bindings: Env;
};

export const createApp = <E extends HonoEnv>() => new Hono<BaseEnv & E>();

// `c.executionCtx` throws when there's no live request, e.g. app.request in tests.
export const waitUntil = (c: Context, promise: Promise<unknown>): void => {
  try {
    c.executionCtx.waitUntil(promise);
  }
  catch {
    // No execution context to hand the work to. Run it detached, but surface
    // failures rather than swallowing them.
    void promise.catch(err => console.error("waitUntil fallback task failed", err));
  }
};
