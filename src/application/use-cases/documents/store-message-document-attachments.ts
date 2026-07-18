import type {
  DocumentRecord,
  DocumentType
} from "../../../core/domain/documents/document-record.js";
import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { AttachmentDownloadPort } from "../../../ports/attachment-download-port.js";
import type { DocumentFolderPolicyPort } from "../../../ports/document-folder-policy-port.js";
import type { DocumentRepositoryPort } from "../../../ports/document-repository-port.js";
import type { DocumentStoragePort } from "../../../ports/document-storage-port.js";

export interface StoreMessageDocumentAttachmentsDependencies {
  readonly attachmentDownloader: AttachmentDownloadPort;
  readonly documentStorage: DocumentStoragePort;
  readonly documentFolderPolicy?: DocumentFolderPolicyPort;
  readonly repository: DocumentRepositoryPort;
  readonly generateId: () => string;
  readonly now: () => Date;
}

export interface StoreMessageDocumentAttachmentsInput {
  readonly provider: string;
  readonly receivedAt: Date;
  readonly attachments: readonly MessageAttachment[];
  readonly userText?: string;
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
}

export type StoreMessageDocumentAttachmentResult =
  | {
      readonly status: "uploaded";
      readonly document: DocumentRecord;
    }
  | {
      readonly status: "skipped";
      readonly reason: "missing_provider_file_id";
      readonly attachment: MessageAttachment;
    };

export class StoreMessageDocumentAttachmentsUseCase {
  constructor(
    private readonly dependencies: StoreMessageDocumentAttachmentsDependencies
  ) {}

  async execute(
    input: StoreMessageDocumentAttachmentsInput
  ): Promise<readonly StoreMessageDocumentAttachmentResult[]> {
    const results: StoreMessageDocumentAttachmentResult[] = [];

    for (const attachment of input.attachments) {
      if (!attachment.providerFileId) {
        results.push({
          status: "skipped",
          reason: "missing_provider_file_id",
          attachment
        });
        continue;
      }

      const downloaded =
        await this.dependencies.attachmentDownloader.downloadAttachment({
          provider: input.provider,
          providerFileId: attachment.providerFileId,
          ...(attachment.fileName ? { fileName: attachment.fileName } : {}),
          ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
          ...(attachment.sizeBytes ? { sizeBytes: attachment.sizeBytes } : {})
        });
      const targetFolder =
        this.dependencies.documentFolderPolicy?.resolveUploadFolder({
          fileName: downloaded.fileName,
          ...(downloaded.mimeType ? { mimeType: downloaded.mimeType } : {}),
          ...(input.userText ? { userText: input.userText } : {}),
          ...(input.documentType ? { documentType: input.documentType } : {}),
          ...(input.subjectId ? { subjectId: input.subjectId } : {})
        });
      const uploaded = await this.dependencies.documentStorage.uploadDocument({
        fileName: downloaded.fileName,
        ...(downloaded.mimeType ? { mimeType: downloaded.mimeType } : {}),
        bytes: downloaded.bytes,
        ...(targetFolder ? { targetFolderId: targetFolder.folderId } : {})
      });
      const now = this.dependencies.now();
      const document: DocumentRecord = {
        id: this.dependencies.generateId(),
        provider: "google_drive",
        externalId: uploaded.externalId,
        name: uploaded.name,
        url: uploaded.url,
        ...(input.documentType ? { documentType: input.documentType } : {}),
        ...(input.subjectId ? { subjectId: input.subjectId } : {}),
        status: "registered",
        createdAt: now,
        updatedAt: now
      };

      await this.dependencies.repository.saveDocument(document);

      results.push({
        status: "uploaded",
        document
      });
    }

    return results;
  }
}
