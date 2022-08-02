import { Miniflare } from "miniflare";

const mf = new Miniflare({
  envPath: true,
  packagePath: true,
  wranglerConfigPath: true,
  buildCommand:
    "wrangler publish --dry-run --outdir=dist --tsconfig ./test/tsconfig.mock.json",
  scriptPath: "dist/index.js",
  modules: true,
});

describe("index", () => {
  it("should throw error if no name supplied", async () => {
    const response = await mf.dispatchFetch("http://localhost/");
    const { message } = await response.json();

    expect(message).toBe("Missing name parameter");
    expect(response.status).toBe(400);
  });
  it("should use put handler for put request", async () => {
    const response = await mf.dispatchFetch("http://localhost/test", {
      method: "PUT",
    });
    const { message } = await response.json();
    expect(message).toBe("put");
  });
  it("should use get handler for get request", async () => {
    const response = await mf.dispatchFetch("http://localhost/test", {
      method: "GET",
    });
    const { message } = await response.json();
    expect(message).toBe("get");
  });
  it("should return options for options request", async () => {
    const response = await mf.dispatchFetch("http://localhost/test", {
      method: "OPTIONS",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, PUT, OPTIONS"
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type"
    );
  });
  it("should throw error if unsupported method", async () => {
    const response = await mf.dispatchFetch("http://localhost/test", {
      method: "POST",
    });
    const { message } = await response.json();
    expect(message).toBe("Unsupported method: POST");
    expect(response.status).toBe(405);
  });
});
