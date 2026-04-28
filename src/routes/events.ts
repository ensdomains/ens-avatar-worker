import type { Context } from "hono";
import { BaseEnv, createApp } from "@/utils/hono";
import { type NetworkMiddlewareEnv } from "@/utils/chains";
import type { MediaType } from "@/utils/media";

const router = createApp<NetworkMiddlewareEnv>();

const subscribeHandler = (mediaType: MediaType) => (c: Context<BaseEnv & NetworkMiddlewareEnv>) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.text("expected websocket", 426);
  }

  const url = new URL("https://do/subscribe");
  url.searchParams.set("network", c.var.network);
  url.searchParams.set("name", c.req.param("name"));
  url.searchParams.set("mediaType", mediaType);

  const id = c.env.MEDIA_NOTIFIER.idFromName("global");
  return c.env.MEDIA_NOTIFIER.get(id).fetch(new Request(url, c.req.raw));
};

router.get("/:name/events", subscribeHandler("avatar"));
router.get("/:name/h/events", subscribeHandler("header"));

export default router;
