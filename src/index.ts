import { createApp } from "./utils/hono";
import { NetworkMiddlewareEnv, networkMiddleware } from "./utils/chains";
import avatarRouter from "./routes/avatar";
import headerRouter from "./routes/header";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { boundUploadBody } from "./utils/upload";

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
app.get("/health", c => c.json({
  status: "ok",
  commit: c.env.SOURCE_COMMIT ?? "unknown",
  environment: c.env.ENVIRONMENT,
}));
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  await next();
});
app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  console.error("Image request failed", error.name);
  return c.text("Image service is temporarily unavailable", 503);
});
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const requestOrigin = c.req.header("Origin") || "";
      // We rely on ENVIRONMENT from wrangler config
      const isProd = c.env.ENVIRONMENT === "production";

      // If production environment: only allow subdomains of approved suffixes
      if (isProd) {
        try {
          const hostname = new URL(requestOrigin).hostname;
          const allows = (host: string, suffix: string) =>
            host === suffix || host.endsWith(`.${suffix}`);

          if (PROD_ALLOWED_ORIGIN_SUFFIXES.some(suffix => allows(hostname, suffix))) {
            return requestOrigin; // reflect approved origin
          }
        }
        catch {
          // If it's not a valid URL, deny
        }
        return ""; // empty => disallowed
      }

      // Otherwise (development), allow all
      return "*";
    },
    allowMethods: ["GET", "PUT", "POST", "OPTIONS", "DELETE"],
  }),
);
app.use("*", boundUploadBody);
const networkRouter = createApp<NetworkMiddlewareEnv>().use(networkMiddleware);

networkRouter.route("/", avatarRouter);
networkRouter.route("/", headerRouter);

app.route("/", networkRouter);
app.route("/:network", networkRouter);

export default app;
