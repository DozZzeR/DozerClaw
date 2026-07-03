import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LocalFileStorage } from "../../../src/infrastructure/providers/local-file-storage/local-file-storage.js";

describe("LocalFileStorage", () => {
  it("stores bytes under the configured root with a sanitized file name", async () => {
    const root = mkdtempSync(join(tmpdir(), "dozerclaw-file-storage-"));

    try {
      const storage = new LocalFileStorage({
        rootDirectory: root,
        generateId: () => "stored-file-1"
      });

      const stored = await storage.storeFile({
        fileName: "../unsafe report.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([1, 2, 3])
      });

      expect(stored).toEqual({
        id: "stored-file-1",
        path: join(root, "stored-file-1", "unsafe_report.pdf"),
        sizeBytes: 3
      });
      expect(readFileSync(stored.path)).toEqual(Buffer.from([1, 2, 3]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
