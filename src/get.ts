import { error } from "itty-router/error";
import { ValidatedRequest } from "./chains";
import { Env } from "./types";
import { getOwnerAndAvailable } from "./utils";

export const handleGet = async (request: ValidatedRequest, env: Env) => {
  const { name, network, chain } = request;

  let file = await env.AVATAR_BUCKET.get(`${network}/registered/${name}`);
  let fileBody = file?.body;

  if (!file) {
    const { owner, available } = await getOwnerAndAvailable({
      env,
      chain,
      name,
    });

    if (!available && owner) {
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
        const { objects, ...rest } = await env.AVATAR_BUCKET.list({
          prefix: `${network}/unregistered/${name}/`,
          cursor,
        });

        const keys = objects.map((o) => o.key);
        if (!keys.length) {
          break;
        }

        await env.AVATAR_BUCKET.delete(keys);
        if (rest.truncated) {
          cursor = rest.cursor;
        } else {
          break;
        }
      } while (true);
    }
  }

  if (!file || file.httpMetadata?.contentType !== "image/jpeg") {
    return error(404, `${name} not found on ${network}`);
  }

  const asHead = request.method === "HEAD";

  return new Response(asHead ? undefined : fileBody, {
    status: 200,
    headers: {
      "Content-Length": String(file.size),
    },
  });
};
