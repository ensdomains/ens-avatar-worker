import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, recoverTypedDataAddress } from "viem";
import { normalize } from "viem/ens";
import { makeResponse } from "./helpers";
import { AvatarUploadParams, Env } from "./types";
import { EMPTY_ADDRESS, getOwnersAndAvailable } from "./utils";

const dataURLToBytes = (dataURL: string) => {
  const base64 = dataURL.split(",")[1];
  const mime = dataURL.split(",")[0].split(":")[1].split(";")[0];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return { mime, bytes };
};

export default async (
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  name: string,
  network: string
): Promise<Response> => {
  const { expiry, dataURL, sig } = (await request.json()) as AvatarUploadParams;
  const { mime, bytes } = dataURLToBytes(dataURL);
  const hash = bytesToHex(sha256(bytes));

  if (mime !== "image/jpeg") {
    return makeResponse("File must be of type image/jpeg", 403);
  }

  if (name !== normalize(name)) {
    return makeResponse("Name must be in normalized form", 403);
  }

  const verifiedAddress = await recoverTypedDataAddress({
    domain: {
      name: "Ethereum Name Service",
      version: "1",
    },
    types: {
      Upload: [
        { name: "upload", type: "string" },
        { name: "expiry", type: "string" },
        { name: "name", type: "string" },
        { name: "hash", type: "string" },
      ],
    },
    primaryType: "Upload",
    signature: sig,
    message: {
      upload: "avatar",
      expiry,
      name,
      hash,
    },
  });

  const maxSize = 1024 * 512;

  if (bytes.byteLength > maxSize) {
    return makeResponse(`Image is too large`, 413);
  }

  const { available, owner } = await getOwnersAndAvailable(env, network, name);

  if (!available) {
    if (owner === EMPTY_ADDRESS) {
      return makeResponse(`Name not found`, 404);
    } else if (verifiedAddress !== owner) {
      return makeResponse(
        `Address ${verifiedAddress} is not the owner of ${name}`,
        403
      );
    }
  }

  if (parseInt(expiry) < Date.now()) {
    return makeResponse(`Signature expired`, 403);
  }

  const bucket = env.AVATAR_BUCKET;
  const key = available
    ? `${network}/unregistered/${name}/${verifiedAddress}`
    : `${network}/registered/${name}`;

  const uploaded = await bucket.put(key, bytes, {
    httpMetadata: { contentType: "image/jpeg" },
  });

  if (uploaded.key === key) {
    return makeResponse("uploaded", 200);
  } else {
    return makeResponse(`${name} not uploaded`, 500);
  }
};
