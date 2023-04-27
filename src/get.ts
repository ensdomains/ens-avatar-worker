import { makeResponse } from "./helpers";
import { Env } from "./types";
import { EMPTY_ADDRESS, getOwnersAndAvailable } from "./utils";

export default async (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  name: string,
  network: string,
  asHead?: boolean
) => {
  let file = await env.AVATAR_BUCKET.get(`${network}/registered/${name}`);
  let fileBody = file?.body;

  if (!file) {
    const { owner, available } = await getOwnersAndAvailable(
      env,
      network,
      name
    );

    if (!available && owner !== EMPTY_ADDRESS) {
      file = await env.AVATAR_BUCKET.get(
        `${network}/unregistered/${name}/${owner}`
      );
      if (file) {
        const [b1, b2] = file.body.tee();
        fileBody = b2;
        await env.AVATAR_BUCKET.put(`${network}/registered/${name}`, b1, {
          httpMetadata: { contentType: "image/jpeg" },
        });
      }

      let cursor: string | undefined = undefined;

      do {
        const { objects, cursor: newCursor } = await env.AVATAR_BUCKET.list({
          prefix: `${network}/unregistered/${name}/`,
          cursor,
        });

        const keys = objects.map((o) => o.key);
        if (!keys.length) {
          break;
        }

        await env.AVATAR_BUCKET.delete(keys);
        cursor = newCursor as string | undefined;
      } while (true);
    }
  }

  if (!file || file.httpMetadata?.contentType !== "image/jpeg") {
    return makeResponse(`${name} not found on ${network}`, 404);
  }

  return makeResponse(asHead ? undefined : fileBody, 200, {
    "Content-Type": "image/jpeg",
    "Content-Length": file.size,
  });
};
