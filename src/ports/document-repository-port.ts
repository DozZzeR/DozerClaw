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
  searchDocuments(
    input: SearchDocumentsInput
  ): Promise<readonly DocumentRecord[]>;
}
