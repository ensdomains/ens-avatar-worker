import { type Address, type Hex, sha256, toHex } from "viem";
import { EnsPublicClient, Network } from "./chains";
import { getOwnerAndAvailable } from "./owner";
import { notifyMediaChanged } from "./notify";

export type MediaType = "avatar" | "header";

export const MEDIA_BUCKET_KEY = {
  registered(network: Network, name: string) {
    return `${network}/registered/${name}`;
  },
  unregistered(network: Network, name: string, owner: string) {
    return `${network}/unregistered/${name}/${owner}`;
  },
};

export const getMediaBucket = (env: Env, mediaType: MediaType) => {
  if (mediaType === "avatar") {
    return env.AVATAR_BUCKET;
  }
  else if (mediaType === "header") {
    return env.HEADER_BUCKET;
  }
  else {
    throw new Error(`Invalid media type: ${mediaType}`);
  }
};

// Promotes an unregistered upload to the registered key once the name has an
// owner, deletes any other unregistered copies, and notifies subscribers.
export const findAndPromoteUnregisteredMedia = async ({
  env,
  network,
  name,
  client,
  mediaType,
  waitUntil,
}: {
  env: Env;
  client: EnsPublicClient;
  network: Network;
  name: string;
  mediaType: MediaType;
  waitUntil?: (promise: Promise<unknown>) => void;
}) => {
  const { owner, available } = await getOwnerAndAvailable({ client, name });

  if (available || !owner) {
    return;
  }

  const bucket = getMediaBucket(env, mediaType);

  const unregisteredMediaFile = await bucket.get(MEDIA_BUCKET_KEY.unregistered(network, name, owner));

  if (!unregisteredMediaFile) {
    return;
  }

  // R2 only returns sha256 if the original PUT supplied it. New uploads do
  // (see routes/avatar.ts and routes/header.ts); for older objects without it
  // we hash the body via a spare tee branch. Only create that third branch
  // when we actually need it — `tee()` couples branch lifetimes (cancel() on
  // one branch only resolves once the sibling is also canceled), so an unused
  // hash branch left dangling next to the returned body would hang.
  const sha256Buffer = unregisteredMediaFile.checksums?.sha256;

  let putBranch: ReadableStream<Uint8Array>;
  let returnBranch: ReadableStream<Uint8Array>;
  let hashBranch: ReadableStream<Uint8Array> | undefined;

  if (sha256Buffer) {
    [putBranch, returnBranch] = unregisteredMediaFile.body.tee();
  }
  else {
    const [first, rest] = unregisteredMediaFile.body.tee();
    const [second, third] = rest.tee();
    putBranch = first;
    hashBranch = second;
    returnBranch = third;
  }

  const registeredKey = MEDIA_BUCKET_KEY.registered(network, name);
  await bucket.put(registeredKey, putBranch, {
    httpMetadata: unregisteredMediaFile.httpMetadata,
  });

  let cursor: string | undefined = undefined;

  while (true) {
    const { objects, ...rest } = await bucket.list({
      prefix: MEDIA_BUCKET_KEY.unregistered(network, name, ""),
      cursor,
    });

    const fileKeys = objects.map(o => o.key);
    if (!fileKeys.length) {
      break;
    }

    await bucket.delete(fileKeys);
    if (rest.truncated) {
      cursor = rest.cursor;
    }
    else {
      break;
    }
  }

  let hash: Hex;
  if (sha256Buffer) {
    hash = toHex(new Uint8Array(sha256Buffer));
  }
  else {
    const buf = await new Response(hashBranch!).arrayBuffer();
    hash = sha256(new Uint8Array(buf));
  }

  const notifyPromise = notifyMediaChanged(env, {
    type: "media.changed",
    mediaType,
    network,
    name,
    hash,
    size: unregisteredMediaFile.size,
    key: registeredKey,
    address: owner as Address,
    source: "promotion",
    timestamp: Date.now(),
  });
  if (waitUntil) waitUntil(notifyPromise);
  else await notifyPromise;

  return {
    file: unregisteredMediaFile,
    body: returnBranch,
  };
};
