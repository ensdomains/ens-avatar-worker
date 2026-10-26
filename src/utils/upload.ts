import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { normalize } from "viem/ens";

const maxRequestBytes = Math.ceil((512 * 1024) / 3) * 4 + 16 * 1024;

export const isNormalizedName = (name: string) => {
  try {
    return normalize(name) === name;
  }
  catch {
    return false;
  }
};

// Bound the actual stream, even when Content-Length is missing or incorrect.
export const boundUploadBody = createMiddleware(async (c, next) => {
  if (c.req.method !== "PUT") return next();
  if (Number(c.req.header("Content-Length")) > maxRequestBytes)
    throw new HTTPException(413, { message: "Image upload request is too large" });
  if (!c.req.raw.body)
    throw new HTTPException(400, { message: "Upload body is missing" });
  const reader = c.req.raw.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxRequestBytes) {
        await reader.cancel();
        throw new HTTPException(413, { message: "Image upload request is too large" });
      }
      parts.push(value);
    }
  }
  finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  try {
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
  catch {
    throw new HTTPException(400, { message: "Upload body must be valid JSON" });
  }
  c.req.raw = new Request(c.req.raw, { body: bytes });
  await next();
});

export const validateExpiry = (expiry: string) => {
  const timestamp = Number(expiry);
  if (!Number.isSafeInteger(timestamp) || timestamp < Date.now())
    throw new HTTPException(403, { message: "Signature expired" });
  // Existing Manager clients use a one-week upload validity window.
  if (timestamp > Date.now() + 7 * 24 * 60 * 60 * 1000)
    throw new HTTPException(403, { message: "Signature validity is too long" });
};
