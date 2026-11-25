import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import type {
  FileStorageReaderPort,
  FileStorageSearchPort,
  FileStoragePort,
  FindFileByNameInput,
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

    assertWithinRoot(this.options.rootDirectory, path);

    // Restrict permissions: family file contents are sensitive at rest.
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path, input.bytes, { mode: 0o600 });

    return {
      id,
      path,
      sizeBytes: input.bytes.byteLength
    };
  }

  async readFile(input: ReadFileInput): Promise<Uint8Array> {
    assertWithinRoot(this.options.rootDirectory, input.path);

    return readFile(input.path);
  }

  async findFileByName(input: FindFileByNameInput): Promise<FoundFile | undefined> {
    const searchDirectory = input.storageId
      ? join(this.options.rootDirectory, input.storageId)
      : this.options.rootDirectory;

    if (input.storageId && !isWithinRoot(this.options.rootDirectory, searchDirectory)) {
      return undefined;
    }

    const sanitizedName = sanitizeFileName(input.fileName);
    const matches = await findMatchingFiles(searchDirectory, sanitizedName);

    if (matches.length === 1) {
      return { path: matches[0]! };
    }

    // Legacy compatibility: files stored prior to Unicode-preserving sanitization
    // had non-ASCII names collapsed to underscores; allow that lookup ONLY when
    // scoped to a specific storageId directory so unrelated records cannot collide.
    if (matches.length === 0 && input.storageId) {
      const legacyName = legacyAsciiSanitizeFileName(input.fileName);

      if (legacyName !== sanitizedName) {
        const legacyMatches = await findMatchingFiles(searchDirectory, legacyName);

        if (legacyMatches.length === 1) {
          return { path: legacyMatches[0]! };
        }
      }
    }

    return undefined;
  }
}

async function findMatchingFiles(
  directory: string,
  fileName: string
): Promise<string[]> {
  const matches: string[] = [];

  try {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(directory, entry.name);

      if (entry.isFile() && entry.name === fileName) {
        matches.push(path);
        if (matches.length > 1) {
          return matches;
        }
      }

      if (entry.isDirectory()) {
        const nested = await findMatchingFiles(path, fileName);

        for (const nestedPath of nested) {
          matches.push(nestedPath);
          if (matches.length > 1) {
            return matches;
          }
        }
      }
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  return matches;
}

const MAX_FILENAME_BYTES = 200;

function sanitizeFileName(fileName: string): string {
  const basename = (fileName.split(/[\\/]/).at(-1) ?? "file").normalize("NFC");
  const sanitized = basename.replace(/[^\p{L}\p{N}._-]+/gu, "_");

  if (sanitized.length === 0 || /^\.+$/.test(sanitized)) {
    return "file";
  }

  return truncateUtf8FileName(sanitized, MAX_FILENAME_BYTES);
}

function truncateUtf8FileName(name: string, maxBytes: number): string {
  if (Buffer.byteLength(name, "utf8") <= maxBytes) {
    return name;
  }

  const lastDot = name.lastIndexOf(".");
  const hasExtension = lastDot > 0 && lastDot < name.length - 1;
  const rawExtension = hasExtension ? name.slice(lastDot) : "";
  const extension =
    Buffer.byteLength(rawExtension, "utf8") <= Math.floor(maxBytes / 2)
      ? rawExtension
      : "";
  const stem = extension ? name.slice(0, lastDot) : name;
  const stemBudget = Math.max(1, maxBytes - Buffer.byteLength(extension, "utf8"));

  let truncatedStem = "";
  let usedBytes = 0;
  for (const char of stem) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (usedBytes + charBytes > stemBudget) {
      break;
    }
    truncatedStem += char;
    usedBytes += charBytes;
  }

  const result = `${truncatedStem || "file"}${extension}`;

  return /^\.+$/.test(result) ? "file" : result;
}

function legacyAsciiSanitizeFileName(fileName: string): string {
  const basename = fileName.split(/[\\/]/).at(-1) ?? "file";
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]+/g, "_");

  if (sanitized.length === 0 || /^\.+$/.test(sanitized)) {
    return "file";
  }

  return sanitized;
}

function isWithinRoot(rootDirectory: string, candidatePath: string): boolean {
  const resolvedRoot = resolve(rootDirectory);
  const resolvedCandidate = resolve(candidatePath);
  const rel = relative(resolvedRoot, resolvedCandidate);

  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

function assertWithinRoot(rootDirectory: string, candidatePath: string): void {
  if (!isWithinRoot(rootDirectory, candidatePath)) {
    throw new Error("File path escapes configured local file storage root.");
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
