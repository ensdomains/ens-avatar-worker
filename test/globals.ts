import { Miniflare } from "miniflare";
import type { describe as describe_ } from "vitest";

declare global {
  function getMiniflareBindings(): Bindings;
  function getMiniflareR2Bucket(name: string): Promise<R2Bucket>;
  function getMiniflareDurableObjectStorage(
    id: DurableObjectId
  ): Promise<DurableObjectStorage>;
  function setupMiniflareIsolatedStorage(): typeof describe_;
  const mf: Miniflare;
}

export const describe = setupMiniflareIsolatedStorage();

export {};
