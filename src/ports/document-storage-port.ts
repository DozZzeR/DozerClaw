export interface DocumentStoragePort {
  resolveDocument(input: ResolveDocumentInput): Promise<ResolvedDocument>;
}

export interface ResolveDocumentInput {
  readonly externalIdOrUrl: string;
}

export interface ResolvedDocument {
  readonly externalId: string;
  readonly name: string;
  readonly url: string;
}
