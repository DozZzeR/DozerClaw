import type { DocumentType } from "../core/domain/documents/document-record.js";

export interface DocumentFolderPolicyPort {
  resolveUploadFolder(
    input: ResolveDocumentUploadFolderInput
  ): DocumentUploadFolderResolution | undefined;
}

export interface ResolveDocumentUploadFolderInput {
  readonly fileName: string;
  readonly mimeType?: string;
  readonly userText?: string;
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
}

export type DocumentUploadFolderResolution =
  | ResolvedDocumentUploadFolder
  | DocumentUploadFolderChoice;

export interface ResolvedDocumentUploadFolder {
  readonly status: "resolved";
  readonly path: string;
  readonly folderId: string;
  readonly confidence: number;
}

export interface DocumentUploadFolderChoice {
  readonly status: "needs_choice";
  readonly path: string;
  readonly folderId: string;
  readonly confidence: number;
  readonly options: readonly DocumentUploadFolderOption[];
}

export interface DocumentUploadFolderOption {
  readonly path: string;
  readonly folderId: string;
}
