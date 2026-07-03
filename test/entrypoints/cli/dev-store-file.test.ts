import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runDevStoreFile } from "../../../src/entrypoints/cli/dev-store-file.js";
import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteFileInboxRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-file-inbox-repository.js";

describe("runDevStoreFile", () => {
  it("requires a file path", async () => {
    const lines: string[] = [];

    const exitCode = await runDevStoreFile({
      env: {
        NODE_ENV: "test"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual(["DOZERCLAW_DEV_FILE_PATH is required."]);
  });

  it("blocks production", async () => {
    const lines: string[] = [];

    const exitCode = await runDevStoreFile({
      env: {
        NODE_ENV: "production",
        DOZERCLAW_DEV_FILE_PATH: "/tmp/example.txt"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual(["dev file storage is not available in production."]);
  });

  it("stores a local file and persists inbox metadata", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-file-inbox-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const storageRoot = join(directory, "storage");
    const sourcePath = join(directory, "unsafe report.txt");
    const lines: string[] = [];

    try {
      writeFileSync(sourcePath, Buffer.from("hello file inbox"));

      const exitCode = await runDevStoreFile({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_FILE_STORAGE_ROOT: storageRoot,
          DOZERCLAW_DEV_FILE_PATH: sourcePath,
          DOZERCLAW_DEV_FILE_MIME_TYPE: "text/plain"
        },
        write(line) {
          lines.push(line);
        }
      });

      expect(exitCode).toBe(0);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^stored file: file-inbox-/);
      expect(lines[1]).toMatch(/^storage path: /);

      const database = createSqliteDatabase({ path: databasePath });
      const repository = new SqliteFileInboxRepository(database);
      const [storedLine] = lines as [string, string];
      const id = storedLine.replace("stored file: ", "");
      const record = await repository.findFileInboxRecordById(id);

      expect(record).toBeDefined();
      expect(record).toEqual(
        expect.objectContaining({
          id,
          originalFileName: "unsafe report.txt",
          mimeType: "text/plain",
          sizeBytes: 16
        })
      );
      expect(readFileSync(record!.storagePath)).toEqual(Buffer.from("hello file inbox"));

      database.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
