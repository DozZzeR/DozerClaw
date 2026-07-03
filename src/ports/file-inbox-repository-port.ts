import type { FileInboxRecord } from "../core/domain/file-inbox/file-inbox-record.js";

export interface FileInboxRepositoryPort {
  saveFileInboxRecord(record: FileInboxRecord): Promise<void>;
  findFileInboxRecordById(id: string): Promise<FileInboxRecord | undefined>;
}
