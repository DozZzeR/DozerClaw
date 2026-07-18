export interface FileStoragePort {
  storeFile(input: StoreFileInput): Promise<StoredFile>;
}

export interface FileStorageReaderPort {
  readFile(input: ReadFileInput): Promise<Uint8Array>;
}

export interface FileStorageSearchPort {
  findFileByName(input: FindFileByNameInput): Promise<FoundFile | undefined>;
}

export interface StoreFileInput {
  readonly fileName: string;
  readonly mimeType?: string;
  readonly bytes: Uint8Array;
}

export interface ReadFileInput {
  readonly path: string;
}

export interface FindFileByNameInput {
  readonly fileName: string;
}

export interface StoredFile {
  readonly id: string;
  readonly path: string;
  readonly sizeBytes: number;
}

export interface FoundFile {
  readonly path: string;
}
