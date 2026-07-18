export type DocumentProvider = "google_drive";

export type DocumentStatus = "registered" | "archived";

export type DocumentType =
  | "identity"
  | "legal"
  | "health"
  | "finance"
  | "education"
  | "travel"
  | "home"
  | "reference"
  | "other";

export interface DocumentRecord {
  readonly id: string;
  readonly provider: DocumentProvider;
  readonly externalId: string;
  readonly name: string;
  readonly url: string;
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
  readonly semanticMemoryEntryId?: string;
  readonly status: DocumentStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
