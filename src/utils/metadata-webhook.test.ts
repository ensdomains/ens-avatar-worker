import { describe, expect, test, vi } from "vitest";
import { sendMetadataCacheInvalidation } from "./metadata-webhook";

const WEBHOOK_URL = "https://ens-metadata-v2.ensdomains.workers.dev/webhook";
const WEBHOOK_SECRET = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const TIMESTAMP_SECONDS = 1_782_217_149;
const TIMESTAMP_MS = TIMESTAMP_SECONDS * 1000;

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

const hexToBytes = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const sign = async (secret: string, message: string) => {
  const keyBytes = hexToBytes(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return bytesToHex(new Uint8Array(signature));
};

describe("sendMetadataCacheInvalidation", () => {
  test("posts a signed avatar invalidation webhook for mainnet uploads", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await expect(sendMetadataCacheInvalidation({
      env: {
        METADATA_WEBHOOK_URL: WEBHOOK_URL,
        METADATA_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
      fetcher,
      mediaType: "avatar",
      name: "test.eth",
      network: "mainnet",
      now: () => TIMESTAMP_MS,
      source: "ens-avatar-worker",
    })).resolves.toBe("sent");

    const event = {
      event_type: "AvatarUpdated",
      protocol: "v1",
      name: "test.eth",
      namehash: null,
      block_number: 0,
      tx_hash: "0x",
      log_index: 0,
      contract_address: "0x",
      data: JSON.stringify({
        source: "ens-avatar-worker",
        mediaType: "avatar",
        network: "mainnet",
      }),
      timestamp: TIMESTAMP_SECONDS,
    };
    const rawBody = JSON.stringify(event);
    const signature = await sign(WEBHOOK_SECRET, `${TIMESTAMP_SECONDS}.${rawBody}`);

    expect(fetcher).toHaveBeenCalledWith(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-timestamp": String(TIMESTAMP_SECONDS),
        "x-webhook-signature": `sha256=${signature}`,
      },
      body: rawBody,
    });
  });

  test("posts a signed header invalidation webhook for sepolia uploads", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await sendMetadataCacheInvalidation({
      env: {
        METADATA_WEBHOOK_URL: WEBHOOK_URL,
        METADATA_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
      fetcher,
      mediaType: "header",
      name: "test.eth",
      network: "sepolia",
      now: () => TIMESTAMP_MS,
      source: "ens-avatar-worker",
    });

    const [, init] = fetcher.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({
      event_type: "HeaderUpdated",
      protocol: "v2",
      name: "test.eth",
      namehash: null,
      timestamp: TIMESTAMP_SECONDS,
    });
  });

  test("skips unsupported networks", async () => {
    const fetcher = vi.fn();

    await expect(sendMetadataCacheInvalidation({
      env: {
        METADATA_WEBHOOK_URL: WEBHOOK_URL,
        METADATA_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
      fetcher,
      mediaType: "avatar",
      name: "test.eth",
      network: "goerli",
      now: () => TIMESTAMP_MS,
      source: "ens-avatar-worker",
    })).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();
  });

  test("skips when webhook config is missing", async () => {
    const fetcher = vi.fn();

    await expect(sendMetadataCacheInvalidation({
      env: {},
      fetcher,
      mediaType: "avatar",
      name: "test.eth",
      network: "mainnet",
      now: () => TIMESTAMP_MS,
      source: "ens-avatar-worker",
    })).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();
  });

  test("rejects when the webhook response is not successful", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("bad", { status: 500 }));

    await expect(sendMetadataCacheInvalidation({
      env: {
        METADATA_WEBHOOK_URL: WEBHOOK_URL,
        METADATA_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
      fetcher,
      mediaType: "avatar",
      name: "test.eth",
      network: "mainnet",
      now: () => TIMESTAMP_MS,
      source: "ens-avatar-worker",
    })).rejects.toThrow("Metadata webhook failed with status 500");
  });
});
