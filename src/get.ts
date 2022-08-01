import { Env } from "./types";

export default async (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  name: string
) => {
  const file = await env.AVATAR_BUCKET.get(name);
  if (!file) {
    return new Response(`${name} not found`, {
      status: 404,
    });
  }
  return new Response(file.body, {
    status: 200,
    headers: {
      "Content-Type": file.httpMetadata.contentType!,
    },
  });
};
