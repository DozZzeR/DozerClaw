import type { FileInboxRecord } from "../../../core/domain/file-inbox/file-inbox-record.js";
import type { PendingFileDuplicateDecision } from "../../../ports/state-repository-port.js";
import type { AttachmentDownloadPort } from "../../../ports/attachment-download-port.js";
import type { FileInboxRepositoryPort } from "../../../ports/file-inbox-repository-port.js";
import type { FileStoragePort } from "../../../ports/file-storage-port.js";

export type FileDuplicateMutationDecision = "copy" | "overwrite";

export interface ResolveFileDuplicateDecisionDependencies {
  readonly attachmentDownloader: AttachmentDownloadPort;
  readonly fileStorage: FileStoragePort;
  readonly repository: FileInboxRepositoryPort;
  readonly generateId: () => string;
  readonly now: () => Date;
}

export interface ResolveFileDuplicateDecisionInput {
  readonly decision: FileDuplicateMutationDecision;
  readonly pending: PendingFileDuplicateDecision;
}

export type ResolveFileDuplicateDecisionResult =
  | {
      readonly status: "copied";
      readonly record: FileInboxRecord;
    }
  | {
      readonly status: "overwritten";
      readonly record: FileInboxRecord;
    }
  | {
      readonly status: "unavailable";
      readonly reason: "missing_source_attachment" | "existing_record_not_found";
    };

export class ResolveFileDuplicateDecisionUseCase {
  constructor(
    private readonly dependencies: ResolveFileDuplicateDecisionDependencies
  ) {}

  async execute(
    input: ResolveFileDuplicateDecisionInput
  ): Promise<ResolveFileDuplicateDecisionResult> {
    const source = input.pending.sourceAttachment;

    if (
      !input.pending.provider ||
      !input.pending.receivedAt ||
      !source?.providerFileId
    ) {
      return {
        status: "unavailable",
        reason: "missing_source_attachment"
      };
    }

    const targetFileName =
      input.decision === "copy"
        ? input.pending.suggestedCopyName
        : input.pending.fileName;
    const downloaded = await this.dependencies.attachmentDownloader.downloadAttachment({
      provider: input.pending.provider,
      providerFileId: source.providerFileId,
      fileName: targetFileName,
      ...(source.mimeType ? { mimeType: source.mimeType } : {}),
      ...(source.sizeBytes ? { sizeBytes: source.sizeBytes } : {})
    });
    const storedFile = await this.dependencies.fileStorage.storeFile({
      fileName: targetFileName,
      ...(downloaded.mimeType ? { mimeType: downloaded.mimeType } : {}),
      bytes: downloaded.bytes
    });

    if (input.decision === "copy") {
      const record: FileInboxRecord = {
        id: this.dependencies.generateId(),
        originalFileName: input.pending.suggestedCopyName,
        ...(downloaded.mimeType ? { mimeType: downloaded.mimeType } : {}),
        sizeBytes: storedFile.sizeBytes,
        storageId: storedFile.id,
        storagePath: storedFile.path,
        receivedAt: input.pending.receivedAt,
        createdAt: this.dependencies.now()
      };

      await this.dependencies.repository.saveFileInboxRecord(record);

      return {
        status: "copied",
        record
      };
    }

    const existingRecord = await this.dependencies.repository.findFileInboxRecordById(
      input.pending.existingRecordId
    );

    if (!existingRecord) {
      return {
        status: "unavailable",
        reason: "existing_record_not_found"
      };
    }

    const record: FileInboxRecord = {
      id: existingRecord.id,
      originalFileName: input.pending.fileName,
      ...(downloaded.mimeType ? { mimeType: downloaded.mimeType } : {}),
      sizeBytes: storedFile.sizeBytes,
      storageId: storedFile.id,
      storagePath: storedFile.path,
      receivedAt: input.pending.receivedAt,
      createdAt: existingRecord.createdAt
    };

    await this.dependencies.repository.saveFileInboxRecord(record);

    return {
      status: "overwritten",
      record
    };
  }
}
