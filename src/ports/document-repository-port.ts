import type { DocumentRecord } from "../core/domain/documents/document-record.js";

export interface DocumentRepositoryPort {
  saveDocument(document: DocumentRecord): Promise<void>;
  findDocumentByExternalId(
    provider: DocumentRecord["provider"],
    externalId: string
  ): Promise<DocumentRecord | undefined>;
}
