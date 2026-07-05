import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

import { StoreInboundFileUseCase } from "../../application/use-cases/file-inbox/store-inbound-file.js";
import { loadConfig } from "../../composition/config.js";
import { LocalFileStorage } from "../../infrastructure/providers/local-file-storage/local-file-storage.js";
import { createSqliteDatabase } from "../../infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteFileInboxRepository } from "../../infrastructure/providers/sqlite/sqlite-file-inbox-repository.js";

export interface DevStoreFileOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
}

export async function runDevStoreFile(
  options: DevStoreFileOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write("dev file storage is not available in production.");

    return 1;
  }

  const filePath = options.env.DOZERCLAW_DEV_FILE_PATH;

  if (!filePath) {
    options.write("DOZERCLAW_DEV_FILE_PATH is required.");

    return 1;
  }

  const config = loadConfig(options.env);
  const database = createSqliteDatabase({ path: config.sqlite.databasePath });
  const repository = new SqliteFileInboxRepository(database);
  const fileStorage = new LocalFileStorage({
    rootDirectory: options.env.DOZERCLAW_FILE_STORAGE_ROOT ?? "data/file-inbox",
    generateId: randomUUID
  });
  const storeInboundFile = new StoreInboundFileUseCase({
    fileStorage,
    repository,
    generateId: () => `file-inbox-${randomUUID()}`,
    now: () => new Date()
  });

  try {
    const bytes = await readFile(filePath);
    const result = await storeInboundFile.execute({
      fileName: basename(filePath),
      ...(options.env.DOZERCLAW_DEV_FILE_MIME_TYPE
        ? { mimeType: options.env.DOZERCLAW_DEV_FILE_MIME_TYPE }
        : {}),
      bytes,
      receivedAt: new Date()
    });

    if (result.status === "duplicate") {
      options.write(`duplicate file: ${result.fileName}`);
      options.write(`existing file: ${result.existingRecord.id}`);

      return 0;
    }

    const record = result.record;

    options.write(`stored file: ${record.id}`);
    options.write(`storage path: ${record.storagePath}`);

    return 0;
  } finally {
    database.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevStoreFile({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
