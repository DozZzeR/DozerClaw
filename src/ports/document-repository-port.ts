import type { DocumentRecord } from "../core/domain/documents/document-record.js";
import type { DocumentType } from "../core/domain/documents/document-record.js";

export interface SearchDocumentsInput {
  readonly query?: string;
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
  readonly limit: number;
}

export interface DocumentRepositoryPort {
  saveDocument(document: DocumentRecord): Promise<void>;
  findDocumentByExternalId(
    provider: DocumentRecord["provider"],
    externalId: string
  ): Promise<DocumentRecord | undefined>;
  findDocumentsByIds(ids: readonly string[]): Promise<readonly DocumentRecord[]>;
  searchDocuments(
    input: SearchDocumentsInput
  ): Promise<readonly DocumentRecord[]>;
}
