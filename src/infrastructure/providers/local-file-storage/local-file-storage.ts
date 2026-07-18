import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  FileStorageReaderPort,
  FileStoragePort,
  ReadFileInput,
  StoreFileInput,
  StoredFile
} from "../../../ports/file-storage-port.js";

export interface LocalFileStorageOptions {
  readonly rootDirectory: string;
  readonly generateId: () => string;
}

export class LocalFileStorage implements FileStoragePort, FileStorageReaderPort {
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
}

function sanitizeFileName(fileName: string): string {
  const basename = fileName.split(/[\\/]/).at(-1) ?? "file";
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]+/g, "_");

  return sanitized.length > 0 ? sanitized : "file";
}
