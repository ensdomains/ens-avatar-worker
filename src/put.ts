import {
  defaultAbiCoder,
  namehash,
  sha256,
  verifyTypedData,
} from "ethers/lib/utils";
import { AvatarUploadParams, Env } from "./types";

const _handleFetch =
  (registryAddress: string, endpoint: string) =>
  async (
    data: string
  ): Promise<{
    jsonrpc: string;
    result: string;
    id: number;
  }> => {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: registryAddress,
            data,
          },
          "latest",
        ],
        id: 1,
      }),
    }).then((res) => res.json());
  };

const dataURLToBytes = (dataURL: string) => {
  const base64 = dataURL.split(",")[1];
  const mime = dataURL.split(",")[0].split(":")[1].split(";")[0];
  const bytes = new TextEncoder().encode(base64);
  return { mime, bytes };
};

export default async (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  name: string
): Promise<Response> => {
  const handleFetch = _handleFetch(env.REGISTRY_ADDRESS, env.WEB3_ENDPOINT);
  const { expiry, data, sig } = (await request.json()) as AvatarUploadParams;
  const { mime, bytes } = dataURLToBytes(data);
  const hash = sha256(bytes);

  const verifiedAddress = verifyTypedData(
    {
      name: "Ethereum Name Service",
      version: "1",
    },
    {
      Upload: [
        { name: "upload", type: "string" },
        { name: "expiry", type: "string" },
        { name: "name", type: "string" },
        { name: "hash", type: "string" },
      ],
    },
    {
      upload: "avatar",
      expiry,
      name,
      hash,
    },
    sig
  );

  let owner: string;
  try {
    const nameHash = namehash(name);
    const ownerData = await handleFetch("0x02571be3" + nameHash.substring(2));
    const [_owner] = defaultAbiCoder.decode(["address"], ownerData.result);
    owner = _owner;
  } catch {
    return new Response(`${name} not found`, {
      status: 404,
    });
  }

  if (verifiedAddress !== owner) {
    return new Response(
      `Address ${verifiedAddress} is not the owner of ${name}`,
      {
        status: 403,
      }
    );
  }

  const bucket = env.AVATAR_BUCKET;
  const uploaded = await bucket.put(name, bytes, {
    httpMetadata: { contentType: mime },
  });
  if (uploaded.key === name) {
    return new Response(`${name} uploaded`, {
      status: 200,
    });
  } else {
    return new Response(`${name} not uploaded`, {
      status: 500,
    });
  }
};
