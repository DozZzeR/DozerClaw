export interface FileStoragePort {
  storeFile(input: StoreFileInput): Promise<StoredFile>;
}

export interface StoreFileInput {
  readonly fileName: string;
  readonly mimeType?: string;
  readonly bytes: Uint8Array;
}

export interface StoredFile {
  readonly id: string;
  readonly path: string;
  readonly sizeBytes: number;
}
