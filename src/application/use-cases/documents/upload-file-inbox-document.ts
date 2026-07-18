import type {
  DocumentRecord,
  DocumentType
} from "../../../core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../ports/document-repository-port.js";
import type { DocumentStoragePort } from "../../../ports/document-storage-port.js";
import type { FileInboxRepositoryPort } from "../../../ports/file-inbox-repository-port.js";
import type {
  FileStorageReaderPort,
  FileStorageSearchPort
} from "../../../ports/file-storage-port.js";

export interface UploadFileInboxDocumentDependencies {
  readonly fileInboxRepository: FileInboxRepositoryPort;
  readonly fileStorage: FileStorageReaderPort;
  readonly fileStorageSearch?: FileStorageSearchPort;
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

    const resolvedLocalFile = await this.resolveReadableLocalFile(localFile);

    if (!resolvedLocalFile) {
      return {
        status: "not_found"
      };
    }

    const bytes = resolvedLocalFile.bytes;
    const uploaded = await this.dependencies.documentStorage.uploadDocument({
      fileName: resolvedLocalFile.record.originalFileName,
      ...(resolvedLocalFile.record.mimeType
        ? { mimeType: resolvedLocalFile.record.mimeType }
        : {}),
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

  private async resolveReadableLocalFile(localFile: NonNullable<
    Awaited<ReturnType<FileInboxRepositoryPort["findFileInboxRecordById"]>>
  >): Promise<{ readonly record: typeof localFile; readonly bytes: Uint8Array } | undefined> {
    try {
      return {
        record: localFile,
        bytes: await this.dependencies.fileStorage.readFile({
          path: localFile.storagePath
        })
      };
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }

    const found = await this.dependencies.fileStorageSearch?.findFileByName({
      fileName: localFile.originalFileName
    });

    if (!found) {
      await this.dependencies.fileInboxRepository.deleteFileInboxRecordById(localFile.id);

      return undefined;
    }

    const movedRecord = {
      ...localFile,
      storagePath: found.path
    };
    await this.dependencies.fileInboxRepository.saveFileInboxRecord(movedRecord);

    return {
      record: movedRecord,
      bytes: await this.dependencies.fileStorage.readFile({ path: found.path })
    };
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
