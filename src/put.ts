import { sha256 } from "@noble/hashes/sha256";
import { json } from "itty-router";
import { error } from "itty-router/error";
import * as v from "valibot";
import { bytesToHex, isAddress, type Address, type Hex } from "viem";
import { normalize } from "viem/ens";
import { ValidatedRequest } from "./chains";
import { Env } from "./types";
import { getOwnerAndAvailable, getVerifiedAddress } from "./utils";

const dataURLToBytes = (dataURL: string) => {
  const base64 = dataURL.split(",")[1];
  const mime = dataURL.split(",")[0].split(":")[1].split(";")[0];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return { mime, bytes };
};

const UploadSchema = v.object({
  expiry: v.pipe(
    v.string("expiry value is missing"),
    v.regex(/^\d+$/, "expiry value is not number")
  ),
  dataURL: v.string("dataURL value is missing"),
  sig: v.pipe(
    v.string("sig value is missing"),
    v.hexadecimal<Hex, string>("sig value is not hex")
  ),
  unverifiedAddress: v.pipe(
    v.string("unverifiedAddress value is missing"),
    v.hexadecimal("unverifiedAddress value is not hex"),
    v.check<Address, string>(
      isAddress,
      "unverifiedAddress value is not address"
    )
  ),
});

export const handlePut = async (request: ValidatedRequest, env: Env) => {
  const { name, network, chain } = request;

  const { success, output } = v.safeParse(UploadSchema, await request.json());
  if (!success) return error(400, "Request is missing parameters");
  const { expiry, dataURL, sig, unverifiedAddress } = output;

  const { mime, bytes } = dataURLToBytes(dataURL);
  const hash = bytesToHex(sha256(bytes));

  if (mime !== "image/jpeg")
    return error(415, "File must be of type image/jpeg");

  if (name !== normalize(name))
    return error(400, "Name must be in normalized form");

  const verifiedAddress = await getVerifiedAddress({
    env,
    chain,
    sig,
    expiry,
    name,
    hash,
    unverifiedAddress,
  });

  if (!verifiedAddress) return error(400, "Invalid signature");

  const maxSize = 1024 * 512;

  if (bytes.byteLength > maxSize) return error(413, "Image is too large");

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

  if (parseInt(expiry) < Date.now()) return error(403, "Signature expired");

  const bucket = env.AVATAR_BUCKET;
  const key = available
    ? `${network}/unregistered/${name}/${verifiedAddress}`
    : `${network}/registered/${name}`;

  const uploaded = await bucket.put(key, bytes, {
    httpMetadata: { contentType: "image/jpeg" },
  });

  if (uploaded.key === key) {
    return json({ message: "uploaded" }, { status: 200 });
  } else {
    return error(500, `${name} not uploaded`);
  }
};
