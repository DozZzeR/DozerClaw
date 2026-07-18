import type {
  DocumentRecord,
  DocumentType
} from "../../../core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../ports/document-repository-port.js";
import type { DocumentStoragePort } from "../../../ports/document-storage-port.js";
import type { FileInboxRepositoryPort } from "../../../ports/file-inbox-repository-port.js";
import type { FileStorageReaderPort } from "../../../ports/file-storage-port.js";

export interface UploadFileInboxDocumentDependencies {
  readonly fileInboxRepository: FileInboxRepositoryPort;
  readonly fileStorage: FileStorageReaderPort;
  readonly documentStorage: DocumentStoragePort;
  readonly documentRepository: DocumentRepositoryPort;
  readonly generateId: () => string;
  readonly now: () => Date;
}

export interface UploadFileInboxDocumentInput {
  readonly fileInboxRecordId: string;
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
}

export type UploadFileInboxDocumentResult =
  | {
      readonly status: "uploaded";
      readonly document: DocumentRecord;
    }
  | {
      readonly status: "not_found";
    };

export class UploadFileInboxDocumentUseCase {
  constructor(
    private readonly dependencies: UploadFileInboxDocumentDependencies
  ) {}

  async execute(
    input: UploadFileInboxDocumentInput
  ): Promise<UploadFileInboxDocumentResult> {
    const localFile =
      await this.dependencies.fileInboxRepository.findFileInboxRecordById(
        input.fileInboxRecordId
      );

    if (!localFile) {
      return {
        status: "not_found"
      };
    }

    const bytes = await this.dependencies.fileStorage.readFile({
      path: localFile.storagePath
    });
    const uploaded = await this.dependencies.documentStorage.uploadDocument({
      fileName: localFile.originalFileName,
      ...(localFile.mimeType ? { mimeType: localFile.mimeType } : {}),
      bytes
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

    await this.dependencies.documentRepository.saveDocument(document);

    return {
      status: "uploaded",
      document
    };
  }
}
