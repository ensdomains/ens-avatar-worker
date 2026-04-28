import { createApp } from "@/utils/hono";
import type { Network, NetworkMiddlewareEnv } from "@/utils/chains";
import type { MediaType } from "@/utils/media";

const router = createApp<NetworkMiddlewareEnv>();

const buildSubscribeRequest = (
  req: Request,
  network: Network,
  name: string,
  mediaType: MediaType,
) => {
  const url = new URL("https://do/subscribe");
  url.searchParams.set("network", network);
  url.searchParams.set("name", name);
  url.searchParams.set("mediaType", mediaType);
  return new Request(url, req);
};

router.get("/:name/events", (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.text("expected websocket", 426);
  }
  const id = c.env.MEDIA_NOTIFIER.idFromName("global");
  return c.env.MEDIA_NOTIFIER
    .get(id)
    .fetch(buildSubscribeRequest(c.req.raw, c.var.network, c.req.param("name"), "avatar"));
});

router.get("/:name/h/events", (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.text("expected websocket", 426);
  }
  const id = c.env.MEDIA_NOTIFIER.idFromName("global");
  return c.env.MEDIA_NOTIFIER
    .get(id)
    .fetch(buildSubscribeRequest(c.req.raw, c.var.network, c.req.param("name"), "header"));
});

export default router;
