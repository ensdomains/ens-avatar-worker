import onRequestGet from "@/get";
import onRequestPut from "@/put";
import { makeResponse } from "./helpers";
import { Env } from "./types";

/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const name = url.pathname.split("/").pop();

    if (!name) {
      return makeResponse("Missing name parameter", 400);
    }

    switch (request.method) {
      case "PUT": {
        return onRequestPut(request, env, ctx, name);
      }
      case "GET": {
        return onRequestGet(request, env, ctx, name);
      }
      case "OPTIONS": {
        return makeResponse(null);
      }
      default:
        return makeResponse(`Unsupported method: ${request.method}`, 405);
    }
  },
};
