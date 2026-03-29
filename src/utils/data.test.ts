import { describe, expect, test } from "vitest";

import { dataURLToBytes } from "@/utils/data";

describe("dataURLToBytes", () => {
  test("should correctly extract MIME type and bytes from a PNG data URL", () => {
    const dataURL =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const { mime, bytes } = dataURLToBytes(dataURL);

    expect(mime).toBe("image/png");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  test("should correctly extract MIME type and bytes from a JPEG data URL", () => {
    const dataURL =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8R6KKKAP/2Q==";
    const { mime, bytes } = dataURLToBytes(dataURL);

    expect(mime).toBe("image/jpeg");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  test("should correctly extract MIME type and bytes from an SVG data URL", () => {
    const dataURL =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIzIiBmaWxsPSJyZWQiIC8+PC9zdmc+";
    const { mime, bytes } = dataURLToBytes(dataURL);

    expect(mime).toBe("image/svg+xml");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  test("should correctly extract MIME type and bytes from a plain text data URL", () => {
    const dataURL = "data:text/plain;base64,SGVsbG8gV29ybGQh";
    const { mime, bytes } = dataURLToBytes(dataURL);

    expect(mime).toBe("text/plain");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(12); // "Hello World!" is 12 bytes

    // Verify the content by converting back to a string
    const decoder = new TextDecoder();
    expect(decoder.decode(bytes)).toBe("Hello World!");
  });

  test("should handle data URLs without a MIME type", () => {
    const dataURL =
      "data:;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    const { mime, bytes } = dataURLToBytes(dataURL);

    expect(mime).toBe("");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  test("should throw an error for an invalid data URL format", () => {
    const invalidDataURL = "invalid-data-url";

    expect(() => dataURLToBytes(invalidDataURL)).toThrow();
  });
});
