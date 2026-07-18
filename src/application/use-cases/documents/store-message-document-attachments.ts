import type {
  DocumentRecord,
  DocumentType
} from "../../../core/domain/documents/document-record.js";
import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { AttachmentDownloadPort } from "../../../ports/attachment-download-port.js";
import type { DocumentUploadFolderOption } from "../../../ports/document-folder-policy-port.js";
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

export interface UploadPreparedDocumentInput {
  readonly attachment: PreparedDocumentAttachment;
  readonly targetFolderId?: string;
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
}

export type StoreMessageDocumentAttachmentResult =
  | {
      readonly status: "uploaded";
      readonly document: DocumentRecord;
    }
  | {
      readonly status: "needs_folder_choice";
      readonly attachment: PreparedDocumentAttachment;
      readonly parentPath: string;
      readonly parentFolderId: string;
      readonly options: readonly DocumentUploadFolderOption[];
      readonly documentType?: DocumentType;
      readonly subjectId?: string;
    }
  | {
      readonly status: "skipped";
      readonly reason: "missing_provider_file_id";
      readonly attachment: MessageAttachment;
    };

export interface PreparedDocumentAttachment {
  readonly fileName: string;
  readonly mimeType?: string;
  readonly bytes: Uint8Array;
}

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

      if (targetFolder?.status === "needs_choice") {
        results.push({
          status: "needs_folder_choice",
          attachment: {
            fileName: downloaded.fileName,
            ...(downloaded.mimeType ? { mimeType: downloaded.mimeType } : {}),
            bytes: downloaded.bytes
          },
          parentPath: targetFolder.path,
          parentFolderId: targetFolder.folderId,
          options: targetFolder.options,
          ...(input.documentType ? { documentType: input.documentType } : {}),
          ...(input.subjectId ? { subjectId: input.subjectId } : {})
        });
        continue;
      }

      const uploaded = await this.dependencies.documentStorage.uploadDocument({
        fileName: downloaded.fileName,
        ...(downloaded.mimeType ? { mimeType: downloaded.mimeType } : {}),
        bytes: downloaded.bytes,
        ...(targetFolder?.status === "resolved"
          ? { targetFolderId: targetFolder.folderId }
          : {})
      });
      const document = await this.registerUploadedDocument(uploaded, {
        ...(input.documentType ? { documentType: input.documentType } : {}),
        ...(input.subjectId ? { subjectId: input.subjectId } : {})
      });

      results.push({
        status: "uploaded",
        document
      });
    }

    return results;
  }

  async uploadPrepared(
    input: UploadPreparedDocumentInput
  ): Promise<Extract<StoreMessageDocumentAttachmentResult, { readonly status: "uploaded" }>> {
    const uploaded = await this.dependencies.documentStorage.uploadDocument({
      fileName: input.attachment.fileName,
      ...(input.attachment.mimeType ? { mimeType: input.attachment.mimeType } : {}),
      bytes: input.attachment.bytes,
      ...(input.targetFolderId ? { targetFolderId: input.targetFolderId } : {})
    });
    const document = await this.registerUploadedDocument(uploaded, {
      ...(input.documentType ? { documentType: input.documentType } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {})
    });

    return {
      status: "uploaded",
      document
    };
  }

  private async registerUploadedDocument(
    uploaded: { readonly externalId: string; readonly name: string; readonly url: string },
    metadata: { readonly documentType?: DocumentType; readonly subjectId?: string }
  ): Promise<DocumentRecord> {
    const now = this.dependencies.now();
    const document: DocumentRecord = {
      id: this.dependencies.generateId(),
      provider: "google_drive",
      externalId: uploaded.externalId,
      name: uploaded.name,
      url: uploaded.url,
      ...(metadata.documentType ? { documentType: metadata.documentType } : {}),
      ...(metadata.subjectId ? { subjectId: metadata.subjectId } : {}),
      status: "registered",
      createdAt: now,
      updatedAt: now
    };

    await this.dependencies.repository.saveDocument(document);

    return document;
  }
}
