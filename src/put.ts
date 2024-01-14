import { sha256 } from "@noble/hashes/sha256";
import { error } from "itty-router/error";
import { text } from "itty-router/text";
import { bytesToHex, recoverTypedDataAddress } from "viem";
import { normalize } from "viem/ens";
import { ValidatedRequest } from "./chains";
import { AvatarUploadParams, Env } from "./types";
import { getOwnerAndAvailable } from "./utils";

const dataURLToBytes = (dataURL: string) => {
  const base64 = dataURL.split(",")[1];
  const mime = dataURL.split(",")[0].split(":")[1].split(";")[0];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return { mime, bytes };
};

export const handlePut = async (request: ValidatedRequest, env: Env) => {
  const { name, network, chain } = request;
  const { expiry, dataURL, sig } = (await request.json()) as AvatarUploadParams;
  const { mime, bytes } = dataURLToBytes(dataURL);
  const hash = bytesToHex(sha256(bytes));

  if (mime !== "image/jpeg") {
    return error(415, "File must be of type image/jpeg");
  }

  if (name !== normalize(name)) {
    return error(400, "Name must be in normalized form");
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
  }).catch((e) => {
    console.error("Error while recovering typed data address");
    console.error(e);
    return null;
  });

  if (!verifiedAddress) {
    return error(400, "Invalid signature");
  }

  const maxSize = 1024 * 512;

  if (bytes.byteLength > maxSize) {
    return error(413, "Image is too large");
  }

  const { available, owner } = await getOwnerAndAvailable({ env, chain, name });

  if (!available) {
    if (!owner) {
      return error(404, "Name not found");
    } else if (verifiedAddress !== owner) {
      return error(
        403,
        `Address ${verifiedAddress} is not the owner of ${name}`
      );
    }
  }

  if (parseInt(expiry) < Date.now()) {
    return error(403, "Signature expired");
  }

  const bucket = env.AVATAR_BUCKET;
  const key = available
    ? `${network}/unregistered/${name}/${verifiedAddress}`
    : `${network}/registered/${name}`;

  const uploaded = await bucket.put(key, bytes, {
    httpMetadata: { contentType: "image/jpeg" },
  });

  if (uploaded.key === key) {
    return text("uploaded", { status: 200 });
  } else {
    return text(`${name} not uploaded`, { status: 500 });
  }
};
