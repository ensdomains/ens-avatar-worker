import type { Context } from "hono";

export const addImageResponseHeaders = ({
  c,
  size,
}: {
  c: Context;
  size: string;
}) => {
  c.header("Content-Type", "image/jpeg");
  c.header("Content-Length", size);
  c.header("Cache-Control", "public, max-age=3600");
};
