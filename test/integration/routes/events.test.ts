import { describe, expect, test } from "vitest";
import { env } from "cloudflare:test";
import app from "@/index";

describe("Events routes", () => {
  // 426 (not 404) proves the request reached the events handler. If the static
  // /events route ever lost precedence to the /:name wildcard, this would fall
  // through to the avatar read and fail.
  test("GET /events without an Upgrade header returns 426", async () => {
    const res = await app.request("/events", {}, env);
    expect(res.status).toBe(426);
    expect(await res.text()).toBe("expected websocket");
  });

  test("GET /:name/events without an Upgrade header returns 426", async () => {
    const res = await app.request("/test.eth/events", {}, env);
    expect(res.status).toBe(426);
  });

  test("GET /:name/h/events without an Upgrade header returns 426", async () => {
    const res = await app.request("/test.eth/h/events", {}, env);
    expect(res.status).toBe(426);
  });
});
