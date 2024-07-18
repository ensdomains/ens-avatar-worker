import { sha256 } from "@noble/hashes/sha256";
import { createAnvil } from "@viem/anvil";
import { describe } from "test/globals";
import { bytesToHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { Network, ValidatedRequest, getChainFromNetwork } from "./chains";
import { handlePut } from "./put";
import { getOwnerAndAvailable } from "./utils";

vi.mock("./utils", async (importActual) => ({
  ...(await importActual<object>()),
  getOwnerAndAvailable: vi.fn(),
}));

const dataURLToBytes = (dataURL: string) => {
  const base64 = dataURL.split(",")[1];
  const mime = dataURL.split(",")[0].split(":")[1].split(";")[0];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return { mime, bytes };
};

const account = mnemonicToAccount(
  "test test test test test test test test test test test junk"
);
const expiry = String(Date.now() + 100000);
const name = "test.eth";

const walletAddress = account.address;

const makeHash = (dataURL: string) =>
  bytesToHex(sha256(dataURLToBytes(dataURL).bytes));

const server = createAnvil({ port: 8551 });

const makeSig = ({
  upload = "avatar",
  expiry: expiry_ = expiry,
  name: name_ = name,
  dataURL,
}: {
  upload?: string;
  expiry?: string;
  name?: string;
  dataURL: string;
}) =>
  account.signTypedData({
    domain: {
      name: "Ethereum Name Service",
      version: "1",
    },
    types: {
      Upload: [
        { name: "upload", type: "string" },
        { name: "expiry", type: "string" },
        { name: "name", type: "string" },
        { name: "hash", type: "string" },
      ],
    },
    primaryType: "Upload",
    message: {
      upload,
      expiry: expiry_,
      name: name_,
      hash: makeHash(dataURL),
    },
  });

const createRequest = ({
  name,
  network = "mainnet",
  body,
  bodyString = JSON.stringify(body),
  ...init
}: {
  name: string;
  network?: Network;
  body: object;
  bodyString?: string;
} & Omit<RequestInit, "body">) =>
  Object.assign(
    new Request(`http://localhost/${network}/${name}`, {
      ...init,
      body: bodyString,
      headers: {
        "content-type": "application/json",
        ...init.headers,
      },
    }),
    {
      name,
      network,
      chain: getChainFromNetwork(network)!,
    } as ValidatedRequest
  );

const getEnv = () => ({
  ...getMiniflareBindings(),
  WEB3_ENDPOINT_MAP: JSON.stringify({
    mainnet: `http://${server.host}:${server.port}`,
  }),
});

beforeAll(async () => {
  await server.start();
});
afterAll(async () => {
  await server.stop();
});

describe("put", () => {
  test("upload image", async () => {
    vi.mocked(getOwnerAndAvailable).mockResolvedValueOnce({
      owner: walletAddress,
      available: false,
    });

    const dataURL = "data:image/jpeg;base64,test123123";

    const request = createRequest({
      name: "test.eth",
      body: {
        expiry,
        dataURL,
        sig: await makeSig({ dataURL }),
        unverifiedAddress: walletAddress,
      },
      method: "PUT",
    });

    const response = await handlePut(request, getEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "message": "uploaded",
      }
    `);

    const AVATAR_BUCKET = getMiniflareBindings().AVATAR_BUCKET;
    const result = await AVATAR_BUCKET.get("mainnet/registered/test.eth");
    const buffer = await result!
      .arrayBuffer()
      .then((b) => new Uint8Array(b.slice(0, b.byteLength)));
    expect(buffer).toEqual(dataURLToBytes(dataURL).bytes);
  });
  test("upload image when name is available", async () => {
    vi.mocked(getOwnerAndAvailable).mockResolvedValueOnce({
      owner: null,
      available: true,
    });

    const dataURL = "data:image/jpeg;base64,test123123";

    const request = createRequest({
      name: "test.eth",
      body: {
        expiry,
        dataURL,
        sig: await makeSig({ dataURL }),
        unverifiedAddress: walletAddress,
      },
      method: "PUT",
    });

    const response = await handlePut(request, getEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "message": "uploaded",
      }
    `);

    const AVATAR_BUCKET = getMiniflareBindings().AVATAR_BUCKET;
    const result = await AVATAR_BUCKET.get(
      "mainnet/unregistered/test.eth/" + walletAddress
    );
    const buffer = await result!
      .arrayBuffer()
      .then((b) => new Uint8Array(b.slice(0, b.byteLength)));
    expect(buffer).toEqual(dataURLToBytes(dataURL).bytes);
  });
  test("return error when address cannot be recovered", async () => {
    const dataURL = "data:image/jpeg;base64,test123123";

    const request = createRequest({
      name: "test.eth",
      body: {
        expiry,
        dataURL,
        sig: "0x1234",
        unverifiedAddress: walletAddress,
      },
      method: "PUT",
    });

    const response = await handlePut(request, getEnv());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "error": "Invalid signature",
        "status": 400,
      }
    `);
  });
  test("return error when image too large", async () => {
    const dataURL =
      "data:image/jpeg;base64," +
      Array(512 * 1024)
        .fill(0)
        .map(() => Math.floor(Math.random() * 256).toString(16))
        .join("");

    const request = createRequest({
      name: "test.eth",
      body: {
        expiry,
        dataURL,
        sig: await makeSig({ dataURL }),
        unverifiedAddress: walletAddress,
      },
      method: "PUT",
    });

    const response = await handlePut(request, getEnv());
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "error": "Image is too large",
        "status": 413,
      }
    `);
  });
  test("return error when owner is not name owner", async () => {
    vi.mocked(getOwnerAndAvailable).mockResolvedValueOnce({
      owner: "0x123",
      available: false,
    });

    const dataURL = "data:image/jpeg;base64,test123123";

    const request = createRequest({
      name: "test.eth",
      body: {
        expiry,
        dataURL,
        sig: await makeSig({ dataURL }),
        unverifiedAddress: walletAddress,
      },
      method: "PUT",
    });

    const response = await handlePut(request, getEnv());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "error": "Address ${walletAddress} is not the owner of test.eth",
        "status": 403,
      }
    `);
  });
  test("return error when signature has expired", async () => {
    vi.mocked(getOwnerAndAvailable).mockResolvedValueOnce({
      owner: walletAddress,
      available: false,
    });

    const dataURL = "data:image/jpeg;base64,test123123";

    const request = createRequest({
      name: "test.eth",
      body: {
        expiry: "1",
        dataURL,
        sig: await makeSig({ dataURL, expiry: "1" }),
        unverifiedAddress: walletAddress,
      },
      method: "PUT",
    });

    const response = await handlePut(request, getEnv());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "error": "Signature expired",
        "status": 403,
      }
    `);
  });
  test("return error when file is not image/jpeg", async () => {
    vi.mocked(getOwnerAndAvailable).mockResolvedValueOnce({
      owner: walletAddress,
      available: false,
    });

    const dataURL = "data:text/html;base64,test123123";

    const request = createRequest({
      name: "test.eth",
      body: {
        expiry,
        dataURL,
        sig: await makeSig({ dataURL }),
        unverifiedAddress: walletAddress,
      },
      method: "PUT",
    });

    const response = await handlePut(request, getEnv());

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "error": "File must be of type image/jpeg",
        "status": 415,
      }
    `);
  });
  test("return error when name is not normalized", async () => {
    const dataURL = "data:image/jpeg;base64,test123123";

    const request = createRequest({
      name: "teSt.eth",
      body: {
        expiry,
        dataURL,
        sig: await makeSig({ dataURL, name: "teSt.eth" }),
        unverifiedAddress: walletAddress,
      },
      method: "PUT",
    });

    const response = await handlePut(request, getEnv());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "error": "Name must be in normalized form",
        "status": 400,
      }
    `);
  });
  test("return error when unverifiedAddress is not provided", async () => {
    const dataURL = "data:image/jpeg;base64,test123123";

    const request = createRequest({
      name: "test.eth",
      body: {
        expiry,
        dataURL,
        sig: await makeSig({ dataURL }),
      },
      method: "PUT",
    });

    const response = await handlePut(request, getEnv());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "error": "Request is missing parameters",
        "status": 400,
      }
    `);
  });
});
