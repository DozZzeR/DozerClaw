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

  it("preserves Cyrillic filenames without collapsing distinct documents", async () => {
    const root = mkdtempSync(join(tmpdir(), "dozerclaw-file-storage-"));

    try {
      let seq = 0;
      const storage = new LocalFileStorage({
        rootDirectory: root,
        generateId: () => `stored-${++seq}`
      });

      const passport = await storage.storeFile({
        fileName: "Паспорт.pdf",
        bytes: new Uint8Array([1])
      });
      const certificate = await storage.storeFile({
        fileName: "Справка.pdf",
        bytes: new Uint8Array([2])
      });

      expect(passport.path).toBe(join(root, "stored-1", "Паспорт.pdf"));
      expect(certificate.path).toBe(join(root, "stored-2", "Справка.pdf"));
      expect(
        await storage.findFileByName({
          fileName: "Паспорт.pdf",
          storageId: "stored-1"
        })
      ).toEqual({ path: passport.path });
      expect(
        await storage.findFileByName({
          fileName: "Паспорт.pdf",
          storageId: "stored-2"
        })
      ).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("truncates long Cyrillic filenames safely below 255 UTF-8 bytes while preserving extension and NFD normalization", async () => {
    const root = mkdtempSync(join(tmpdir(), "dozerclaw-file-storage-"));

    try {
      const storage = new LocalFileStorage({
        rootDirectory: root,
        generateId: () => "stored-long"
      });
      const longRussianName = `${"Договор_аренды_квартиры_".repeat(12)}и\u0306.pdf`;
      expect(Buffer.byteLength(longRussianName, "utf8")).toBeGreaterThan(255);

      const stored = await storage.storeFile({
        fileName: longRussianName,
        bytes: new Uint8Array([9, 8, 7])
      });
      const storedBaseName = stored.path.split(/[\\/]/).at(-1) ?? "";

      expect(Buffer.byteLength(storedBaseName, "utf8")).toBeLessThanOrEqual(200);
      expect(storedBaseName.endsWith(".pdf")).toBe(true);
      expect(storedBaseName).not.toContain("\uFFFD");
      expect(
        await storage.findFileByName({
          fileName: longRussianName,
          storageId: "stored-long"
        })
      ).toEqual({ path: stored.path });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sanitizes dot-only names and prevents path escape on readFile", async () => {
    const root = mkdtempSync(join(tmpdir(), "dozerclaw-file-storage-"));

    try {
      const storage = new LocalFileStorage({
        rootDirectory: root,
        generateId: () => "stored-dot"
      });

      const dotdot = await storage.storeFile({
        fileName: "..",
        bytes: new Uint8Array([4, 5])
      });
      const dot = await storage.storeFile({
        fileName: ".",
        bytes: new Uint8Array([6])
      });

      expect(dotdot.path).toBe(join(root, "stored-dot", "file"));
      expect(dot.path).toBe(join(root, "stored-dot", "file"));
      await expect(
        storage.readFile({ path: join(root, "..", "outside.txt") })
      ).rejects.toThrow("escapes configured local file storage root");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns undefined instead of guessing when unscoped findFileByName matches multiple files", async () => {
    const root = mkdtempSync(join(tmpdir(), "dozerclaw-file-storage-"));

    try {
      let seq = 0;
      const storage = new LocalFileStorage({
        rootDirectory: root,
        generateId: () => `stored-${++seq}`
      });

      await storage.storeFile({
        fileName: "report.pdf",
        bytes: new Uint8Array([1])
      });
      await storage.storeFile({
        fileName: "report.pdf",
        bytes: new Uint8Array([2])
      });

      expect(
        await storage.findFileByName({ fileName: "report.pdf" })
      ).toBeUndefined();
      expect(
        await storage.findFileByName({
          fileName: "report.pdf",
          storageId: "stored-2"
        })
      ).toEqual({ path: join(root, "stored-2", "report.pdf") });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
