import { sha256 } from "viem/utils";

export const dataURLToBytes = (dataURL: string) => {
  const base64 = dataURL.split(",")[1];
  const mime = dataURL.split(",")[0].split(":")[1].split(";")[0];
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return { mime, bytes };
};

export const makeHashFromDataUrl = (dataUrl: string) => {
  const { bytes } = dataURLToBytes(dataUrl);
  return sha256(bytes);
};

export const R2GetOrHead = async (bucket: R2Bucket, key: string, isHead: boolean): Promise<R2ObjectBody | null> => {
  if (!isHead) {
    return await bucket.get(key);
  }

  const head = await bucket.head(key);

  if (!head) {
    return null;
  }

  return {
    ...head,
    body: new ReadableStream(),
    bodyUsed: false,
    arrayBuffer() {
      return Promise.resolve(new ArrayBuffer(0));
    },
    text() {
      return Promise.resolve("");
    },
    json() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Promise.resolve({} as any);
    },
    blob() {
      return Promise.resolve(new Blob());
    },
    writeHttpMetadata() {
      throw new Error("Cannot write HTTP metadata on a HEAD request");
    },
  };
};
