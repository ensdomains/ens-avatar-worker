import type { ChangePayload } from "@/durable-objects/media-notifier";

export type { ChangePayload };

export const notifyMediaChanged = async (
  env: Env,
  payload: ChangePayload,
): Promise<void> => {
  const id = env.MEDIA_NOTIFIER.idFromName("global");
  await env.MEDIA_NOTIFIER.get(id).notify(payload);
};
