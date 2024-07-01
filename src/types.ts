import type { Address, Hex } from "viem";

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
  AVATAR_BUCKET: R2Bucket;

  // vars
  WEB3_ENDPOINT_MAP: string;
}

export type AvatarUploadParams = {
  expiry: string;
  dataURL: string;
  sig: Hex;
  unverifiedAddress: Address;
};
