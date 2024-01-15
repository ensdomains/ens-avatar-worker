import { expect, test, vi } from "vitest";
import { validateChain } from "./chains";
import { handleGet } from "./get";
import index from "./index";
import { handlePut } from "./put";

vi.mock("./chains", () => ({
  validateChain: vi.fn(),
}));

vi.mock("./get", () => ({
  handleGet: vi.fn(() => new Response("get")),
}));

vi.mock("./put", () => ({
  handlePut: vi.fn(() => new Response("put")),
}));

test("adds cors headers", async () => {
  const response = await index.fetch(
    new Request("http://localhost/", {
      headers: {
        origin: "http://localhost",
      },
    }),
    {} as any
  );
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://localhost"
  );
  expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
    "PUT, GET, HEAD, OPTIONS"
  );
});

test("validate handler called", async () => {
  await index.fetch(
    new Request("http://localhost/mainnet/test", {
      method: "GET",
    }),
    {} as any
  );
  expect(validateChain).toHaveBeenCalled();
});

test("put handler for put request", async () => {
  const response = await index.fetch(
    new Request("http://localhost/mainnet/test", {
      method: "PUT",
    }),
    {} as any
  );
  expect(handlePut).toHaveBeenCalled();
  expect(await response.text()).toBe("put");
});

test("get handler for get request", async () => {
  const response = await index.fetch(
    new Request("http://localhost/mainnet/test", {
      method: "GET",
    }),
    {} as any
  );
  expect(handleGet).toHaveBeenCalled();
  expect(await response.text()).toBe("get");
});

test("options returned on options request", async () => {
  const response = await index.fetch(
    new Request("http://localhost/mainnet/test", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost",
      },
    }),
    {} as any
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://localhost"
  );
  expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
    "PUT, GET, HEAD, OPTIONS"
  );
});

test("not found for unsupported method", async () => {
  const response = await index.fetch(
    new Request("http://localhost/mainnet/test", {
      method: "POST",
    }),
    {} as any
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchInlineSnapshot(`
    {
      "error": "Not Found",
      "status": 404,
    }
  `);
});

test("not found for unsupported path", async () => {
  const response = await index.fetch(
    new Request("http://localhost/", {
      method: "GET",
    }),
    {} as any
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchInlineSnapshot(`
    {
      "error": "Not Found",
      "status": 404,
    }
  `);
});

test("500 error+cors for internal error", async () => {
  vi.mocked(handlePut).mockImplementation(() => {
    throw new Error("test");
  });
  const response = await index.fetch(
    new Request("http://localhost/mainnet/test", {
      method: "PUT",
      headers: {
        origin: "http://localhost",
      },
    }),
    {} as any
  );
  expect(response.status).toBe(500);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://localhost"
  );
  expect(await response.json()).toMatchInlineSnapshot(`
    {
      "error": "Internal Server Error",
      "status": 500,
    }
  `);
});

// test("calls validateChain", async () => {

// })
