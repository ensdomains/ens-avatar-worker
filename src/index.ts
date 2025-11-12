import { cors } from "hono/cors";

import avatarRouter from "./routes/avatar";
import headerRouter from "./routes/header";
import { type NetworkMiddlewareEnv, networkMiddleware } from "./utils/chains";
import { createApp } from "./utils/hono";

const app = createApp();
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "PUT", "POST", "OPTIONS", "DELETE"],
  }),
);
const networkRouter = createApp<NetworkMiddlewareEnv>().use(networkMiddleware);

networkRouter.route("/", avatarRouter);
networkRouter.route("/", headerRouter);

app.route("/", networkRouter);
app.route("/:network", networkRouter);

export default app;
