export interface FileInboxRecord {
  readonly id: string;
  readonly originalFileName: string;
  readonly mimeType?: string;
  readonly sizeBytes: number;
  readonly storageId: string;
  readonly storagePath: string;
  readonly receivedAt: Date;
  readonly createdAt: Date;
}
