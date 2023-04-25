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
    const networks = env.SUPPORTED_NETWORKS;
    const url = new URL(request.url);
    let network = url.pathname.split("/")[1];
    let name = url.pathname.split("/")[2];

    if (!name) {
      name = network;
      network = "mainnet";
    }

    // make sure name is decoded
    name = decodeURIComponent(name);

    if (!network || !networks.includes(network)) {
      return makeResponse("Network not supported", 400);
    }

    if (!name) {
      return makeResponse("Missing name parameter", 400);
    }

    switch (request.method) {
      case "PUT": {
        return onRequestPut(request, env, ctx, name, network);
      }
      case "GET": {
        return onRequestGet(request, env, ctx, name, network);
      }
      case "HEAD": {
        return onRequestGet(request, env, ctx, name, network, true);
      }
      case "OPTIONS": {
        return makeResponse(null);
      }
      default:
        return makeResponse(`Unsupported method: ${request.method}`, 405);
    }
  },
};
