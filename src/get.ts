import { makeResponse } from "./helpers";
import { Env } from "./types";

export default async (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  name: string
) => {
  const file = await env.AVATAR_BUCKET.get(name);
  if (!file) {
    return makeResponse(`${name} not found`, 404);
  }

  return makeResponse(file.body, 200, {
    "Content-Type": file.httpMetadata.contentType!,
    "Content-Length": file.size,
  });
};
