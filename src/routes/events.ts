import type { Context } from "hono";
import { BaseEnv, createApp } from "@/utils/hono";
import { type NetworkMiddlewareEnv } from "@/utils/chains";
import type { MediaType } from "@/utils/media";

const forwardSubscribe = (
  req: Request,
  notifier: Env["MEDIA_NOTIFIER"],
  params: Record<string, string>,
): Response | Promise<Response> => {
  if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("expected websocket", { status: 426 });
  }

  const url = new URL("https://do/subscribe");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return notifier.get(notifier.idFromName("global")).fetch(new Request(url, req));
};

const router = createApp<NetworkMiddlewareEnv>();

const subscribeHandler = (mediaType: MediaType) => (c: Context<BaseEnv & NetworkMiddlewareEnv>) =>
  forwardSubscribe(c.req.raw, c.env.MEDIA_NOTIFIER, {
    network: c.var.network,
    name: c.req.param("name"),
    mediaType,
  });

router.get("/:name/events", subscribeHandler("avatar"));
router.get("/:name/h/events", subscribeHandler("header"));

// Firehose: every media.changed event across all names, networks, and media types.
export const globalEventsHandler = (c: Context<BaseEnv>) =>
  forwardSubscribe(c.req.raw, c.env.MEDIA_NOTIFIER, { scope: "global" });

export default router;
