import { env } from "cloudflare:test";
import type { ClientWithEns } from "@ensdomains/ensjs/contracts";
import { assert, beforeEach, describe, expect, test, vi } from "vitest";

import type { ModuleMock } from "@test/setup/meta";

import type { MediaType } from "@/utils/media";
import * as media from "@/utils/media";
import * as owner from "@/utils/owner";

const readableStreamToString = async (stream: ReadableStream) => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let done = false;

  while (!done) {
    const { value, done: isDone } = await reader.read();
    if (isDone) {
      done = true;
    } else {
      chunks.push(value);
    }
  }

  // Concatenate Uint8Arrays properly
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  const decoder = new TextDecoder();
  return decoder.decode(result);
};

vi.mock(
  "@/utils/owner",
  () =>
    ({
      getOwnerAndAvailable: vi.fn(),
    }) satisfies ModuleMock<typeof owner>,
);

describe("findAndPromoteUnregisteredMedia", () => {
  const MOCK_DATA = {
    owner: "0x1234567890123456789012345678901234567890",
    network: "mainnet",
    name: "helgesson.eth",
  } as const;

  const mockClient = {} as unknown as ClientWithEns;

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
  });

  const insertMockUnregisteredMedia = async (
    name: string,
    owner: string,
    mediaType: MediaType,
  ) => {
    const bucket = media.getMediaBucket(env, mediaType);

    return bucket.put(
      media.MEDIA_BUCKET_KEY.unregistered(MOCK_DATA.network, name, owner),
      new TextEncoder().encode(`test-image-data-${name}-${owner}`),
      {
        httpMetadata: {
          contentType: "image/jpeg",
        },
      },
    );
  };

  describe.for(["avatar", "header"] as const)("%s media", (mediaType) => {
    const mediaBucket = media.getMediaBucket(env, mediaType);

    const mediaBucketSpy = {
      get: vi.spyOn(mediaBucket, "get"),
      put: vi.spyOn(mediaBucket, "put"),
      list: vi.spyOn(mediaBucket, "list"),
      delete: vi.spyOn(mediaBucket, "delete"),
    };

    test("should return undefined when name is available", async () => {
      // Mock getOwnerAndAvailable to return available: true
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        owner: null,
        available: true,
      });

      const result = await media.findAndPromoteUnregisteredMedia({
        env: env,
        client: mockClient,
        network: "mainnet",
        name: "helgesson.eth",
        mediaType,
      });

      expect(result).toBeUndefined();
      expect(mediaBucketSpy.get).not.toHaveBeenCalled();
    });

    test("should return undefined when no owner is found", async () => {
      // Mock getOwnerAndAvailable to return owner: null
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        owner: null,
        available: false,
      });

      const result = await media.findAndPromoteUnregisteredMedia({
        env: env,
        client: mockClient,
        network: MOCK_DATA.network,
        name: MOCK_DATA.name,
        mediaType,
      });

      expect(result).toBeUndefined();
      expect(mediaBucketSpy.get).not.toHaveBeenCalled();
    });

    test("should return undefined when no unregistered avatar file exists", async () => {
      // Mock getOwnerAndAvailable to return owner
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        owner: MOCK_DATA.owner,
        available: false,
      });

      // Mock R2 bucket get to return null
      mediaBucketSpy.get.mockResolvedValue(null);

      const result = await media.findAndPromoteUnregisteredMedia({
        env: env,
        client: mockClient,
        network: MOCK_DATA.network,
        name: MOCK_DATA.name,
        mediaType,
      });

      expect(result).toBeUndefined();
      expect(mediaBucketSpy.get).toHaveBeenCalledWith(
        media.MEDIA_BUCKET_KEY.unregistered(
          MOCK_DATA.network,
          MOCK_DATA.name,
          MOCK_DATA.owner,
        ),
      );
      expect(mediaBucketSpy.put).not.toHaveBeenCalled();
    });

    test("should promote unregistered avatar to registered and clean up", async () => {
      // Mock getOwnerAndAvailable to return owner
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        owner: MOCK_DATA.owner,
        available: false,
      });

      await insertMockUnregisteredMedia(
        MOCK_DATA.name,
        MOCK_DATA.owner,
        mediaType,
      );
      await insertMockUnregisteredMedia(MOCK_DATA.name, "0x0", mediaType);

      const result = await media.findAndPromoteUnregisteredMedia({
        env: env,
        client: mockClient,
        network: MOCK_DATA.network,
        name: MOCK_DATA.name,
        mediaType,
      });

      // Verify the result
      assert(result !== undefined);

      const text = await readableStreamToString(result.body);
      expect(text).toBe(`test-image-data-${MOCK_DATA.name}-${MOCK_DATA.owner}`);

      // Verify the put operation
      expect(mediaBucketSpy.put).toHaveBeenCalledWith(
        media.MEDIA_BUCKET_KEY.registered(MOCK_DATA.network, MOCK_DATA.name),
        expect.anything(),
        {
          httpMetadata: {
            contentType: "image/jpeg",
          },
        },
      );

      // Verify the list and delete operations
      expect(mediaBucketSpy.list).toHaveBeenCalledWith({
        prefix: media.MEDIA_BUCKET_KEY.unregistered(
          MOCK_DATA.network,
          MOCK_DATA.name,
          "",
        ),
        cursor: undefined,
      });

      expect(mediaBucketSpy.delete).toHaveBeenCalledWith([
        media.MEDIA_BUCKET_KEY.unregistered(
          MOCK_DATA.network,
          MOCK_DATA.name,
          "0x0",
        ),
        media.MEDIA_BUCKET_KEY.unregistered(
          MOCK_DATA.network,
          MOCK_DATA.name,
          MOCK_DATA.owner,
        ),
      ]);
    });

    test("should handle pagination when cleaning up unregistered avatars", async () => {
      // Mock getOwnerAndAvailable to return owner
      vi.mocked(owner.getOwnerAndAvailable).mockResolvedValue({
        owner: MOCK_DATA.owner,
        available: false,
      });

      const unregisteredAvatarFile1 = await insertMockUnregisteredMedia(
        MOCK_DATA.name,
        MOCK_DATA.owner,
        mediaType,
      );
      const unregisteredAvatarFile2 = await insertMockUnregisteredMedia(
        MOCK_DATA.name,
        "0x0",
        mediaType,
      );

      // Mock R2 bucket list to return objects with pagination
      const mockCursor = "next-page-cursor";
      mediaBucketSpy.list
        .mockResolvedValueOnce({
          objects: [unregisteredAvatarFile1],
          truncated: true,
          cursor: mockCursor,
          delimitedPrefixes: [],
        })
        .mockResolvedValueOnce({
          objects: [unregisteredAvatarFile2],
          truncated: false,
          delimitedPrefixes: [],
        });

      const result = await media.findAndPromoteUnregisteredMedia({
        env: env,
        client: mockClient,
        network: MOCK_DATA.network,
        name: MOCK_DATA.name,
        mediaType,
      });

      // Verify the result
      expect(result).toBeDefined();

      // Verify the list and delete operations were called twice
      expect(mediaBucketSpy.list).toHaveBeenCalledTimes(2);
      expect(mediaBucketSpy.list).toHaveBeenCalledWith({
        prefix: media.MEDIA_BUCKET_KEY.unregistered(
          MOCK_DATA.network,
          MOCK_DATA.name,
          "",
        ),
        cursor: undefined,
      });
      expect(mediaBucketSpy.list).toHaveBeenCalledWith({
        prefix: media.MEDIA_BUCKET_KEY.unregistered(
          MOCK_DATA.network,
          MOCK_DATA.name,
          "",
        ),
        cursor: mockCursor,
      });

      expect(mediaBucketSpy.delete).toHaveBeenCalledTimes(2);
      expect(mediaBucketSpy.delete).toHaveBeenCalledWith([
        media.MEDIA_BUCKET_KEY.unregistered(
          MOCK_DATA.network,
          MOCK_DATA.name,
          MOCK_DATA.owner,
        ),
      ]);
      expect(mediaBucketSpy.delete).toHaveBeenCalledWith([
        media.MEDIA_BUCKET_KEY.unregistered(
          MOCK_DATA.network,
          MOCK_DATA.name,
          "0x0",
        ),
      ]);
    });
  });
});
