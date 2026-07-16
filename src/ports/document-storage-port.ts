export interface DocumentStoragePort {
  resolveDocument(input: ResolveDocumentInput): Promise<ResolvedDocument>;
  uploadDocument(input: UploadDocumentInput): Promise<ResolvedDocument>;
}

export interface ResolveDocumentInput {
  readonly externalIdOrUrl: string;
}

export interface UploadDocumentInput {
  readonly fileName: string;
  readonly mimeType?: string;
  readonly bytes: Uint8Array;
}

export interface ResolvedDocument {
  readonly externalId: string;
  readonly name: string;
  readonly url: string;
}
