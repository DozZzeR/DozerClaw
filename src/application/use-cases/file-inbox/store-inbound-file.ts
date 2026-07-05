import type { FileInboxRecord } from "../../../core/domain/file-inbox/file-inbox-record.js";
import type { FileInboxRepositoryPort } from "../../../ports/file-inbox-repository-port.js";
import type { FileStoragePort } from "../../../ports/file-storage-port.js";

export interface StoreInboundFileDependencies {
  readonly fileStorage: FileStoragePort;
  readonly repository: FileInboxRepositoryPort;
  readonly generateId: () => string;
  readonly now: () => Date;
}

export interface StoreInboundFileInput {
  readonly fileName: string;
  readonly mimeType?: string;
  readonly bytes: Uint8Array;
  readonly receivedAt: Date;
}

export type StoreInboundFileResult =
  | {
      readonly status: "stored";
      readonly record: FileInboxRecord;
    }
  | {
      readonly status: "duplicate";
      readonly fileName: string;
      readonly existingRecord: FileInboxRecord;
    };

export class StoreInboundFileUseCase {
  constructor(private readonly dependencies: StoreInboundFileDependencies) {}

  async execute(input: StoreInboundFileInput): Promise<StoreInboundFileResult> {
    const existingRecord =
      await this.dependencies.repository.findLatestFileInboxRecordByOriginalFileName(
        input.fileName
      );

    if (existingRecord) {
      return {
        status: "duplicate",
        fileName: input.fileName,
        existingRecord
      };
    }

    const storedFile = await this.dependencies.fileStorage.storeFile({
      fileName: input.fileName,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      bytes: input.bytes
    });
    const record: FileInboxRecord = {
      id: this.dependencies.generateId(),
      originalFileName: input.fileName,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      sizeBytes: storedFile.sizeBytes,
      storageId: storedFile.id,
      storagePath: storedFile.path,
      receivedAt: input.receivedAt,
      createdAt: this.dependencies.now()
    };

    await this.dependencies.repository.saveFileInboxRecord(record);

    return {
      status: "stored",
      record
    };
  }
}
