import type { DocumentType } from "../core/domain/documents/document-record.js";

export interface DocumentFolderPolicyPort {
  resolveUploadFolder(
    input: ResolveDocumentUploadFolderInput
  ): ResolvedDocumentUploadFolder | undefined;
}

export interface ResolveDocumentUploadFolderInput {
  readonly fileName: string;
  readonly mimeType?: string;
  readonly userText?: string;
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
}

export interface ResolvedDocumentUploadFolder {
  readonly path: string;
  readonly folderId: string;
  readonly confidence: number;
}
