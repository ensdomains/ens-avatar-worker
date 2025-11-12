import { env } from "cloudflare:test";
import { normalize } from "viem/ens";
import { sha256 } from "viem/utils";
import { assert, beforeEach, describe, expect, test, vi } from "vitest";

import { createTestUploadData, TEST_ACCOUNT } from "@test/setup/helpers";
import type { ModuleMock } from "@test/setup/meta";

import app from "@/index";
import * as data from "@/utils/data";
import * as eth from "@/utils/eth";
import * as media from "@/utils/media";
import * as owner from "@/utils/owner";

// Mocks
vi.mock(
  "@/utils/owner",
  () =>
    ({
      getOwnerAndAvailable: vi.fn(),
    }) satisfies ModuleMock<typeof owner>,
);

// Test constants
const MOCK_NAME = "test.eth";
const NORMALIZED_NAME = normalize("test.eth");
// Note: holesky is excluded from tests because viem handles chainId differently for holesky
// during signature verification. While mainnet/goerli/sepolia don't add chainId to the domain
// when not explicitly provided, holesky does, causing cross-chain signature verification to fail.
const MOCK_NETWORKS = ["mainnet", "sepolia", "holesky"] as const;
const MAX_IMAGE_SIZE = 1024 * 512;

describe("Header Routes", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks();
  });

  const bucketSpy = {
    get: vi.spyOn(env.HEADER_BUCKET, "get"),
    put: vi.spyOn(env.HEADER_BUCKET, "put"),
    delete: vi.spyOn(env.HEADER_BUCKET, "delete"),
  };

  const findAndPromoteUnregisteredMediaSpy = vi.spyOn(
    media,
    "findAndPromoteUnregisteredMedia",
  );

  describe("GET /:name/h", () => {
    test("returns 200 with the header image when the header exists in registered storage", async () => {
      // Mock registered header exists
      const imageContent = new Uint8Array([1, 2, 3, 4, 5]);
      await env.HEADER_BUCKET.put(
        media.MEDIA_BUCKET_KEY.registered("mainnet", MOCK_NAME),
        imageContent,
        {
          httpMetadata: { contentType: "image/jpeg" },
        },
      );

      // Make the request
      const res = await app.request(`/${MOCK_NAME}/h`, {}, env);

      // Verify result
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/jpeg");
      expect(res.headers.get("Content-Length")).toBe(
        imageContent.length.toString(),
      );

      // Verify correct key was used
      expect(bucketSpy.get).toHaveBeenCalledWith(
        media.MEDIA_BUCKET_KEY.registered("mainnet", MOCK_NAME),
      );

      // Verify body matches
      const buffer = await res.arrayBuffer();
      expect(new Uint8Array(buffer)).toEqual(imageContent);
    });

    test("correctly promotes and returns an unregistered header when the name becomes registered", async () => {
      // Mock unregistered header exists and is promoted
      const imageBuffer = new Uint8Array([10, 20, 30, 40]);

      await env.HEADER_BUCKET.put(
        media.MEDIA_BUCKET_KEY.unregistered(
          "mainnet",
          MOCK_NAME,
          TEST_ACCOUNT.address,
        ),
        imageBuffer,
        {
          httpMetadata: { contentType: "image/jpeg" },
        },
      );

      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        owner: TEST_ACCOUNT.address,
        available: false,
      });

      // Make the request
      const res = await app.request(`/${MOCK_NAME}/h`, {}, env);

      // Verify result
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/jpeg");
      expect(res.headers.get("Content-Length")).toBe(
        imageBuffer.length.toString(),
      );

      expect(bucketSpy.get).toHaveBeenCalledWith(
        media.MEDIA_BUCKET_KEY.registered("mainnet", MOCK_NAME),
      );

      // Verify the function was called with correct params
      expect(findAndPromoteUnregisteredMediaSpy).toHaveBeenCalledWith({
        env,
        network: "mainnet",
        name: MOCK_NAME,
        client: expect.anything(),
        mediaType: "header",
      });

      const putResult = await env.HEADER_BUCKET.get(
        media.MEDIA_BUCKET_KEY.registered("mainnet", MOCK_NAME),
      );

      assert(putResult);
      expect(putResult.httpMetadata?.contentType).toBe("image/jpeg");
      expect(await putResult.arrayBuffer()).toEqual(imageBuffer.buffer);
    });

    test("returns 404 when no header exists for the name", async () => {
      // Mock unregistered header doesn't exist
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        owner: null,
        available: true,
      });

      // Make the request
      const res = await app.request(`/${MOCK_NAME}/h`, {}, env);

      // Verify result
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(`${MOCK_NAME} not found on mainnet`);
    });

    test.each(MOCK_NETWORKS)("works with network %s", async (network) => {
      // Mock unregistered header doesn't exist
      findAndPromoteUnregisteredMediaSpy.mockResolvedValue(undefined);

      // Make the request
      const res = await app.request(`/${network}/${MOCK_NAME}/h`, {}, env);

      // Verify result shows correct network
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(`${MOCK_NAME} not found on ${network}`);

      // Verify the function was called with correct network
      expect(findAndPromoteUnregisteredMediaSpy).toHaveBeenCalledWith(
        expect.objectContaining({ network }),
      );
    });

    test("returns 200 when using HEAD method with correct headers but no body", async () => {
      // Mock registered header exists
      const imageContent = new Uint8Array([1, 2, 3, 4, 5]);
      await env.HEADER_BUCKET.put(
        media.MEDIA_BUCKET_KEY.registered("mainnet", MOCK_NAME),
        imageContent,
        {
          httpMetadata: { contentType: "image/jpeg" },
        },
      );

      // Make the HEAD request
      // This tests the HTTP HEAD verb functionality which should return metadata only, not the actual image
      // Important for clients that need to check image existence or get dimensions without downloading content
      const res = await app.request(`/${MOCK_NAME}/h`, { method: "HEAD" }, env);

      // Verify result
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/jpeg");
      expect(res.headers.get("Content-Length")).toBe(
        imageContent.length.toString(),
      );

      // Verify body is empty for HEAD request
      const buffer = await res.arrayBuffer();
      expect(buffer.byteLength).toBe(0);
    });

    test("updates an existing image with a new one", async () => {
      // Step 1: Put the initial image into storage
      const initialImage = new Uint8Array([1, 2, 3]);
      await env.HEADER_BUCKET.put(
        media.MEDIA_BUCKET_KEY.registered("sepolia", MOCK_NAME),
        initialImage,
        {
          httpMetadata: { contentType: "image/jpeg" },
        },
      );

      // Get the initial image
      let res = await app.request(`/sepolia/${MOCK_NAME}/h`, {}, env);
      expect(res.status).toBe(200);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(initialImage);

      // Step 2: Put a new image with different content
      const updatedImage = new Uint8Array([4, 5, 6, 7, 8]);
      await env.HEADER_BUCKET.put(
        media.MEDIA_BUCKET_KEY.registered("sepolia", MOCK_NAME),
        updatedImage,
        {
          httpMetadata: { contentType: "image/jpeg" },
        },
      );

      // Verify updated image is returned
      res = await app.request(`/sepolia/${MOCK_NAME}/h`, {}, env);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Length")).toBe(
        updatedImage.length.toString(),
      );
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(updatedImage);
    });

    test("returns 404 when content type is not image/jpeg", async () => {
      // Mock getOwnerAndAvailable to return the owner
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        owner: TEST_ACCOUNT.address,
        available: false,
      });

      // Mock registered header exists with wrong content type
      const imageContent = new Uint8Array([1, 2, 3, 4, 5]);
      await env.HEADER_BUCKET.put(
        media.MEDIA_BUCKET_KEY.registered("mainnet", MOCK_NAME),
        imageContent,
        {
          httpMetadata: { contentType: "text/html" },
        },
      );

      // Make the request
      // NOTE: Using HEAD request here is necessary because R2 objects must be fully consumed in tests,
      // but our handler stops reading the response when content-type doesn't match "image/jpeg".
      // This approach prevents test errors from "unconsumed response" while still testing the behavior.
      const res = await app.request(
        `/${MOCK_NAME}/h`,
        {
          method: "HEAD",
        },
        env,
      );

      // Verify result - should be 404 since it's not a jpeg
      expect(res.status).toBe(404);
    });

    test("deletes all unregistered files when a name becomes registered", async () => {
      // Create multiple unregistered images by different uploaders
      // This test is important to verify the service properly cleans up outdated files
      // when a name transitions from unregistered to registered state
      const imageBuffer = new Uint8Array([10, 20, 30, 40]);
      const uploaders = Array.from(
        { length: 5 },
        (_, i) => `0x${(i + 1).toString().padStart(40, "0")}` as const,
      );

      // Create unregistered files for all uploaders
      for (const uploader of uploaders) {
        await env.HEADER_BUCKET.put(
          media.MEDIA_BUCKET_KEY.unregistered("mainnet", MOCK_NAME, uploader),
          imageBuffer,
          { httpMetadata: { contentType: "image/jpeg" } },
        );
      }

      // Mock that the owner is the first uploader
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        owner: uploaders[0],
        available: false,
      });

      // Make request which should promote the first uploader's file and delete the others
      const res = await app.request(`/${MOCK_NAME}/h`, {}, env);
      expect(res.status).toBe(200);

      // Verify registered file exists
      const registeredFile = await env.HEADER_BUCKET.get(
        media.MEDIA_BUCKET_KEY.registered("mainnet", MOCK_NAME),
      );
      assert(registeredFile);
      await registeredFile.arrayBuffer();

      // Verify unregistered files are deleted
      const { objects } = await env.HEADER_BUCKET.list({
        prefix: `mainnet/unregistered/${MOCK_NAME}`,
      });
      expect(objects.length).toBe(0);
    });

    test("works across different networks", async () => {
      // Setup different files on different networks
      // This test ensures that files are properly isolated by network -
      // each network should have its own storage space and not interfere with others
      const mainnetImage = new Uint8Array([1, 2, 3]);
      const sepoliaImage = new Uint8Array([4, 5, 6]);

      await env.HEADER_BUCKET.put(
        media.MEDIA_BUCKET_KEY.registered("mainnet", MOCK_NAME),
        mainnetImage,
        {
          httpMetadata: { contentType: "image/jpeg" },
        },
      );

      await env.HEADER_BUCKET.put(
        media.MEDIA_BUCKET_KEY.registered("sepolia", MOCK_NAME),
        sepoliaImage,
        {
          httpMetadata: { contentType: "image/jpeg" },
        },
      );

      // Test mainnet network
      let res = await app.request(`/mainnet/${MOCK_NAME}/h`, {}, env);
      let resImage = new Uint8Array(await res.arrayBuffer());
      expect(res.status).toBe(200);
      expect(resImage).toEqual(mainnetImage);

      // Test sepolia network
      res = await app.request(`/sepolia/${MOCK_NAME}/h`, {}, env);
      expect(res.status).toBe(200);
      resImage = new Uint8Array(await res.arrayBuffer());
      expect(resImage).toEqual(sepoliaImage);

      // Files should be isolated by network
      expect(resImage).not.toEqual(mainnetImage);
    });
  });

  describe("PUT /:name", () => {
    // Helper function to perform header uploads with proper signing
    // This abstracts the complexity of creating valid upload requests with signatures
    // and returns the response along with the test data for verification
    const uploadHeader = async (
      name: string,
      dataURL: string,
      network: string,
      expiry?: string,
    ) => {
      const imageBuffer = data.dataURLToBytes(dataURL).bytes;
      const imageHash = sha256(imageBuffer);

      const testData = await createTestUploadData(
        "header",
        name,
        imageHash,
        expiry,
      );

      const res = await app.request(
        `/${network}/${name}/h`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            expiry: testData.expiry,
            dataURL: dataURL,
            sig: testData.sig,
            unverifiedAddress: testData.address,
          }),
        },
        env,
      );

      return {
        res,
        imageBuffer,
        imageHash,
        testData,
      };
    };

    test("returns 200 when upload is successful for a registered name owned by the sender", async () => {
      // Mock name is registered and owned by sender
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        available: false,
        owner: TEST_ACCOUNT.address,
      });

      const dataURL = "data:image/jpeg;base64,test123123";
      const { res, imageBuffer } = await uploadHeader(
        NORMALIZED_NAME,
        dataURL,
        "mainnet",
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchInlineSnapshot(`
        {
          "message": "uploaded",
        }
      `);

      // Verify the file was uploaded to the registered path
      expect(bucketSpy.put).toHaveBeenCalledWith(
        media.MEDIA_BUCKET_KEY.registered("mainnet", NORMALIZED_NAME),
        imageBuffer,
        { httpMetadata: { contentType: "image/jpeg" } },
      );
    });

    test("returns 200 when upload is successful for an available name", async () => {
      // Mock name is available
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        available: true,
        owner: null,
      });

      const dataURL = "data:image/jpeg;base64,test123123";
      const { res, imageBuffer } = await uploadHeader(
        NORMALIZED_NAME,
        dataURL,
        "mainnet",
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchInlineSnapshot(`
        {
          "message": "uploaded",
        }
      `);

      // Verify the file was uploaded to the unregistered path
      expect(bucketSpy.put).toHaveBeenCalledWith(
        media.MEDIA_BUCKET_KEY.unregistered(
          "mainnet",
          NORMALIZED_NAME,
          TEST_ACCOUNT.address,
        ),
        imageBuffer,
        { httpMetadata: { contentType: "image/jpeg" } },
      );
    });

    test("returns 200 when upload is successful for an available name that has expired and has a prior registered image", async () => {
      // Step 1: Put the initial image into storage
      const initialImage = new Uint8Array([1, 2, 3]);
      await env.HEADER_BUCKET.put(
        media.MEDIA_BUCKET_KEY.registered("mainnet", MOCK_NAME),
        initialImage,
        {
          httpMetadata: { contentType: "image/jpeg" },
        },
      );
      // Verify image is returned
      const getRes = await app.request(`/${MOCK_NAME}/h`, {}, env);
      expect(getRes.status).toBe(200);
      expect(getRes.headers.get("Content-Length")).toBe(
        initialImage.length.toString(),
      );
      expect(new Uint8Array(await getRes.arrayBuffer())).toEqual(initialImage);

      // Step 2: Upload a new image
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        available: true,
        owner: null,
      });

      const dataURL = "data:image/jpeg;base64,test123123";
      const { res: putRes2, imageBuffer: putImageBuffer2 } = await uploadHeader(
        NORMALIZED_NAME,
        dataURL,
        "mainnet",
      );
      expect(putRes2.status).toBe(200);
      // Verify the previous registered image is deleted
      expect(bucketSpy.delete).toHaveBeenLastCalledWith(
        media.MEDIA_BUCKET_KEY.registered("mainnet", NORMALIZED_NAME),
      );
      // Verify the file was uploaded to the unregistered path
      expect(bucketSpy.put).toHaveBeenLastCalledWith(
        media.MEDIA_BUCKET_KEY.unregistered(
          "mainnet",
          NORMALIZED_NAME,
          TEST_ACCOUNT.address,
        ),
        putImageBuffer2,
        { httpMetadata: { contentType: "image/jpeg" } },
      );

      // Verify the previous registered image no longer resolves
      const getRes2 = await app.request(`/${MOCK_NAME}`, {}, env);
      expect(getRes2.status).toBe(404);
      expect(await getRes2.text()).toBe(
        `${NORMALIZED_NAME} not found on mainnet`,
      );
    });

    test("returns 400 when the name is not in normalized form", async () => {
      // Use non-normalized name
      const nonNormalizedName = "TeSt.eth";
      const getVerifiedAddressSpy = vi.spyOn(eth, "getVerifiedAddress");

      const dataURL = "data:image/jpeg;base64,test123123";
      const { res } = await uploadHeader(nonNormalizedName, dataURL, "mainnet");

      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Name must be in normalized form");

      // Verify no verification or upload was attempted
      expect(getVerifiedAddressSpy).not.toHaveBeenCalled();
      expect(bucketSpy.put).not.toHaveBeenCalled();
    });

    test("returns 400 when the signature is invalid", async () => {
      // Mock signature verification fails
      vi.mocked(eth.getVerifiedAddress).mockResolvedValue(null);

      const dataURL = "data:image/jpeg;base64,test123123";
      const { res } = await uploadHeader(NORMALIZED_NAME, dataURL, "mainnet");

      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Invalid signature");

      // Verify no upload was attempted
      expect(bucketSpy.put).not.toHaveBeenCalled();
    });

    test("returns 403 when the signature has expired", async () => {
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        available: false,
        owner: TEST_ACCOUNT.address,
      });

      // Using an expired timestamp (past date) for the expiry to trigger the expired signature check
      // This is crucial for preventing replay attacks with old signatures
      const dataURL = "data:image/jpeg;base64,test123123";
      const { res } = await uploadHeader(
        NORMALIZED_NAME,
        dataURL,
        "mainnet",
        (Date.now() - 1000).toString(),
      );

      expect(await res.text()).toBe("Signature expired");
      expect(res.status).toBe(403);

      // Verify no upload was attempted
      expect(bucketSpy.put).not.toHaveBeenCalled();
    });

    test("returns 403 when the uploader is not the owner of a registered name", async () => {
      // Mock name is registered but owned by someone else
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        available: false,
        owner: "0x9876543210987654321098765432109876543210",
      });

      const dataURL = "data:image/jpeg;base64,test123123";
      const { res } = await uploadHeader(NORMALIZED_NAME, dataURL, "mainnet");

      expect(res.status).toBe(403);
      expect(await res.text()).toBe(
        `Address ${TEST_ACCOUNT.address} is not the owner of ${NORMALIZED_NAME}`,
      );

      // Verify no upload was attempted
      expect(bucketSpy.put).not.toHaveBeenCalled();
    });

    test("returns 404 when the name does not exist and is not available", async () => {
      // Mock name doesn't exist and is not available
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        available: false,
        owner: null,
      });

      const dataURL = "data:image/jpeg;base64,test123123";
      const { res } = await uploadHeader(NORMALIZED_NAME, dataURL, "mainnet");

      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Name not found");

      // Verify no upload was attempted
      expect(bucketSpy.put).not.toHaveBeenCalled();
    });

    test("returns 413 when the image is too large", async () => {
      // Mock oversized image
      const oversizedImageBytes = new Uint8Array(MAX_IMAGE_SIZE + 1);
      const base64 = btoa(
        Array.from(oversizedImageBytes)
          .map((byte) => String.fromCharCode(byte))
          .join(""),
      );
      const dataURL = `data:image/jpeg;base64,${base64}`;

      const { res } = await uploadHeader(NORMALIZED_NAME, dataURL, "mainnet");

      expect(res.status).toBe(413);
      expect(await res.text()).toBe("Image is too large");

      // Verify no upload was attempted
      expect(bucketSpy.put).not.toHaveBeenCalled();
    });

    test("returns 415 when the image is not a JPEG", async () => {
      // Mock unsupported image type
      const dataURL = "data:image/png;base64,test123123";
      const { res } = await uploadHeader(NORMALIZED_NAME, dataURL, "mainnet");

      expect(res.status).toBe(415);
      expect(await res.text()).toBe("File must be of type image/jpeg");

      // Verify no upload was attempted
      expect(bucketSpy.put).not.toHaveBeenCalled();
    });

    test("returns 500 when upload fails", async () => {
      // Mock name is registered and owned by sender
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        available: false,
        owner: TEST_ACCOUNT.address,
      });

      // Mock upload failure (key mismatch)
      bucketSpy.put.mockResolvedValue({
        key: "wrong-key",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const dataURL = "data:image/jpeg;base64,test123123";
      const { res } = await uploadHeader(NORMALIZED_NAME, dataURL, "mainnet");

      expect(res.status).toBe(500);
      expect(await res.text()).toBe(`${NORMALIZED_NAME} not uploaded`);
    });

    test.each(MOCK_NETWORKS)("works with network %s", async (network) => {
      // Mock name is registered and owned by sender
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        available: false,
        owner: TEST_ACCOUNT.address,
      });

      // Mock successful upload
      const imageBuffer = new Uint8Array([10, 20, 30, 40]);

      await env.HEADER_BUCKET.put(
        media.MEDIA_BUCKET_KEY.unregistered(
          network,
          NORMALIZED_NAME,
          TEST_ACCOUNT.address,
        ),
        imageBuffer,
        {
          httpMetadata: { contentType: "image/jpeg" },
        },
      );

      const dataURL = `data:image/jpeg;base64,${btoa(
        Array.from(imageBuffer)
          .map((byte) => String.fromCharCode(byte))
          .join(""),
      )}`;
      const { res } = await uploadHeader(NORMALIZED_NAME, dataURL, network);

      expect(res.status).toBe(200);

      // Verify upload was to the correct network
      expect(bucketSpy.put).toHaveBeenCalledWith(
        media.MEDIA_BUCKET_KEY.registered(network, NORMALIZED_NAME),
        imageBuffer,
        { httpMetadata: { contentType: "image/jpeg" } },
      );
    });

    test("returns 400 when the request is missing required parameters", async () => {
      const dataURL = "data:image/jpeg;base64,test123123";
      const imageBuffer = data.dataURLToBytes(dataURL).bytes;
      const imageHash = sha256(imageBuffer);

      const testData = await createTestUploadData(
        "header",
        NORMALIZED_NAME,
        imageHash,
      );

      // Create a request without unverifiedAddress
      const res = await app.request(
        `/mainnet/${NORMALIZED_NAME}/h`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            expiry: testData.expiry,
            dataURL: dataURL,
            sig: testData.sig,
            // unverifiedAddress is intentionally omitted
          }),
        },
        env,
      );

      expect(res.status).toBe(400);
      // Valibot validator should reject with the proper error message
      expect(await res.text()).toContain("unverifiedAddress");
    });
  });
});
