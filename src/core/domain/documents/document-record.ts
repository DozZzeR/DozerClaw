export type DocumentProvider = "google_drive";

export type DocumentStatus = "registered" | "archived";

export interface DocumentRecord {
  readonly id: string;
  readonly provider: DocumentProvider;
  readonly externalId: string;
  readonly name: string;
  readonly url: string;
  readonly status: DocumentStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
