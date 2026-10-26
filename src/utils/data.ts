import { sha256 } from "viem/utils";
import { HTTPException } from "hono/http-exception";

export const dataURLToBytes = (dataURL: string) => {
  const match = /^data:([^;,]*);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataURL);
  if (!match) throw new HTTPException(400, { message: "Invalid image data URL" });
  try {
    const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
    return { mime: match[1], bytes };
  }
  catch {
    throw new HTTPException(400, { message: "Invalid image data URL" });
  }
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
