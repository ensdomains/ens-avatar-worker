import type { Network } from "./chains";

export type MetadataWebhookMediaType = "avatar" | "header";
export type MetadataWebhookResult = "sent" | "skipped";

type MetadataWebhookProtocol = "v1" | "v2";

const METADATA_SERVICE_WEBHOOK_URL = "https://ens-metadata-v2.ensdomains.workers.dev/webhook";

type MetadataWebhookEnv = Partial<Pick<Env, "METADATA_SERVICE_WEBHOOK_SECRET">>;

type SendMetadataCacheInvalidationOptions = {
  env: MetadataWebhookEnv;
  name: string;
  network: Network;
  mediaType: MetadataWebhookMediaType;
  source: string;
  fetcher?: typeof fetch;
  now?: () => number;
};

const getProtocol = (network: Network): MetadataWebhookProtocol | undefined => {
  if (network === "mainnet") return "v1";
  if (network === "sepolia") return "v2";
  return undefined;
};

const getEventType = (mediaType: MetadataWebhookMediaType) => {
  if (mediaType === "avatar") return "AvatarUpdated";
  return "HeaderUpdated";
};

const hexToBytes = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const secretToKeyBytes = (secret: string) => {
  if (secret.length > 0 && secret.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(secret)) {
    return hexToBytes(secret);
  }
  return new TextEncoder().encode(secret);
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const createWebhookSignature = async (secret: string, message: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    secretToKeyBytes(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message) as BufferSource,
  );
  return bytesToHex(new Uint8Array(signature));
};

export const sendMetadataCacheInvalidation = async ({
  env,
  fetcher = fetch,
  mediaType,
  name,
  network,
  now = Date.now,
  source,
}: SendMetadataCacheInvalidationOptions): Promise<MetadataWebhookResult> => {
  const protocol = getProtocol(network);
  if (!protocol || !env.METADATA_SERVICE_WEBHOOK_SECRET) {
    return "skipped";
  }

  const timestamp = Math.floor(now() / 1000);
  const event = {
    event_type: getEventType(mediaType),
    protocol,
    name,
    namehash: null,
    block_number: 0,
    tx_hash: "0x",
    log_index: 0,
    contract_address: "0x",
    data: JSON.stringify({ source, mediaType, network }),
    timestamp,
  };
  const rawBody = JSON.stringify(event);
  const signature = await createWebhookSignature(
    env.METADATA_SERVICE_WEBHOOK_SECRET,
    `${timestamp}.${rawBody}`,
  );

  const response = await fetcher(METADATA_SERVICE_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": String(timestamp),
      "x-webhook-signature": `sha256=${signature}`,
    },
    body: rawBody,
  });

  if (!response.ok) {
    throw new Error(`Metadata webhook failed with status ${response.status}`);
  }

  return "sent";
};
