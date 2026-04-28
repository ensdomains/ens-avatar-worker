import { Hono } from "hono/tiny";
import type { Context } from "hono";
import type { Env as HonoEnv } from "hono/types";

export type BaseEnv = {
  Bindings: Env;
};

export const createApp = <E extends HonoEnv>() => new Hono<BaseEnv & E>();

// `c.executionCtx` throws when there is no Cloudflare ExecutionContext
// (e.g. tests run via `app.request`). Returns a no-op stub that swallows
// the rejection of any promise it's given so callers can use a uniform
// `.waitUntil(...)` interface.
type WaitUntilCtx = { waitUntil(promise: Promise<unknown>): void };

const NULL_CTX: WaitUntilCtx = {
  waitUntil(promise) {
    void promise.catch(() => { /* swallow — no live request to surface to */ });
  },
};

export const getExecutionCtx = (c: Context): WaitUntilCtx => {
  try {
    return c.executionCtx;
  }
  catch {
    return NULL_CTX;
  }
};
