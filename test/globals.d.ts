import { Miniflare } from "miniflare";

declare global {
  function getMiniflareBindings(): Bindings;
  function getMiniflareR2Bucket(name: string): Promise<R2Bucket>;
  function getMiniflareDurableObjectStorage(
    id: DurableObjectId
  ): Promise<DurableObjectStorage>;
  const mf: Miniflare;
}

export {};
