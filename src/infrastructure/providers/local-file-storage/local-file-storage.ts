import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  FileStorageReaderPort,
  FileStorageSearchPort,
  FileStoragePort,
  FoundFile,
  ReadFileInput,
  StoreFileInput,
  StoredFile
} from "../../../ports/file-storage-port.js";

export interface LocalFileStorageOptions {
  readonly rootDirectory: string;
  readonly generateId: () => string;
}

export class LocalFileStorage
  implements FileStoragePort, FileStorageReaderPort, FileStorageSearchPort
{
  constructor(private readonly options: LocalFileStorageOptions) {}

  async storeFile(input: StoreFileInput): Promise<StoredFile> {
    const id = this.options.generateId();
    const directory = join(this.options.rootDirectory, id);
    const fileName = sanitizeFileName(input.fileName);
    const path = join(directory, fileName);

    await mkdir(directory, { recursive: true });
    await writeFile(path, input.bytes);

    return {
      id,
      path,
      sizeBytes: input.bytes.byteLength
    };
  }

  async readFile(input: ReadFileInput): Promise<Uint8Array> {
    return readFile(input.path);
  }

  async findFileByName(input: { readonly fileName: string }): Promise<FoundFile | undefined> {
    return findFileByName(this.options.rootDirectory, sanitizeFileName(input.fileName));
  }
}

async function findFileByName(
  directory: string,
  fileName: string
): Promise<FoundFile | undefined> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(directory, entry.name);

      if (entry.isFile() && entry.name === fileName) {
        return { path };
      }

      if (entry.isDirectory()) {
        const nested = await findFileByName(path, fileName);

        if (nested) {
          return nested;
        }
      }
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }

  return undefined;
}

function sanitizeFileName(fileName: string): string {
  const basename = fileName.split(/[\\/]/).at(-1) ?? "file";
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]+/g, "_");

  return sanitized.length > 0 ? sanitized : "file";
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
