import type { FileInboxRecord } from "../../../core/domain/file-inbox/file-inbox-record.js";
import type { FileInboxRepositoryPort } from "../../../ports/file-inbox-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

interface FileInboxRecordRow {
  readonly id: string;
  readonly original_file_name: string;
  readonly mime_type: string | null;
  readonly size_bytes: number;
  readonly storage_id: string;
  readonly storage_path: string;
  readonly received_at: string;
  readonly created_at: string;
}

export class SqliteFileInboxRepository implements FileInboxRepositoryPort {
  constructor(private readonly database: SqliteDatabase) {}

  async saveFileInboxRecord(record: FileInboxRecord): Promise<void> {
    this.database
      .prepare(
        `
          insert into file_inbox_records (
            id,
            original_file_name,
            mime_type,
            size_bytes,
            storage_id,
            storage_path,
            received_at,
            created_at
          )
          values (
            @id,
            @originalFileName,
            @mimeType,
            @sizeBytes,
            @storageId,
            @storagePath,
            @receivedAt,
            @createdAt
          )
        `
      )
      .run({
        id: record.id,
        originalFileName: record.originalFileName,
        mimeType: record.mimeType ?? null,
        sizeBytes: record.sizeBytes,
        storageId: record.storageId,
        storagePath: record.storagePath,
        receivedAt: record.receivedAt.toISOString(),
        createdAt: record.createdAt.toISOString()
      });
  }

  async findFileInboxRecordById(
    id: string
  ): Promise<FileInboxRecord | undefined> {
    const row = this.database
      .prepare(
        `
          select
            id,
            original_file_name,
            mime_type,
            size_bytes,
            storage_id,
            storage_path,
            received_at,
            created_at
          from file_inbox_records
          where id = ?
        `
      )
      .get(id) as FileInboxRecordRow | undefined;

    return row ? toFileInboxRecord(row) : undefined;
  }

  async findLatestFileInboxRecordByOriginalFileName(
    originalFileName: string
  ): Promise<FileInboxRecord | undefined> {
    const row = this.database
      .prepare(
        `
          select
            id,
            original_file_name,
            mime_type,
            size_bytes,
            storage_id,
            storage_path,
            received_at,
            created_at
          from file_inbox_records
          where original_file_name = ?
          order by created_at desc
          limit 1
        `
      )
      .get(originalFileName) as FileInboxRecordRow | undefined;

    return row ? toFileInboxRecord(row) : undefined;
  }
}

function toFileInboxRecord(row: FileInboxRecordRow): FileInboxRecord {
  return {
    id: row.id,
    originalFileName: row.original_file_name,
    ...(row.mime_type ? { mimeType: row.mime_type } : {}),
    sizeBytes: row.size_bytes,
    storageId: row.storage_id,
    storagePath: row.storage_path,
    receivedAt: new Date(row.received_at),
    createdAt: new Date(row.created_at)
  };
}
