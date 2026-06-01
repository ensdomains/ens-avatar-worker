import { createApp } from "./utils/hono";
import { NetworkMiddlewareEnv, networkMiddleware } from "./utils/chains";
import avatarRouter from "./routes/avatar";
import headerRouter from "./routes/header";
import eventsRouter, { globalEventsHandler } from "./routes/events";
import { cors } from "hono/cors";

export { MediaNotifier } from "./durable-objects/media-notifier";

const PROD_ALLOWED_ORIGIN_SUFFIXES = [
  "ens.domains",
  "ens.dev",
  "ens-cf.workers.dev",
  "ens-app-v3.pages.dev",
  "grails.app",
  "efp.app",
  "ethleaderboard.com",
] as const;

const app = createApp();
const corsMiddleware = cors({
  origin: (origin, c) => {
    const requestOrigin = c.req.header("Origin") || "";
    const isProd = c.env.ENVIRONMENT === "production";

    if (isProd) {
      try {
        const hostname = new URL(requestOrigin).hostname;
        const allows = (host: string, suffix: string) =>
          host === suffix || host.endsWith(`.${suffix}`);

        if (PROD_ALLOWED_ORIGIN_SUFFIXES.some(suffix => allows(hostname, suffix))) {
          return requestOrigin;
        }
      }
      catch {
        // not a valid URL
      }
      return "";
    }

    return "*";
  },
  allowMethods: ["GET", "PUT", "POST", "OPTIONS", "DELETE"],
});

// Hono's cors clones the route response to inject headers; cloning a 101 fails because Response forbids 1xx.
app.use("*", async (c, next) => {
  if (c.req.header("Upgrade")?.toLowerCase() === "websocket") return next();
  return corsMiddleware(c, next);
});

// Cross-network firehose. Registered before the :name routers so the static
// path wins over the /:name wildcard. Network-agnostic, so it sits outside the
// network middleware.
app.get("/events", globalEventsHandler);

const networkRouter = createApp<NetworkMiddlewareEnv>().use(networkMiddleware);

networkRouter.route("/", avatarRouter);
networkRouter.route("/", headerRouter);
networkRouter.route("/", eventsRouter);

app.route("/", networkRouter);
app.route("/:network", networkRouter);

export default app;
