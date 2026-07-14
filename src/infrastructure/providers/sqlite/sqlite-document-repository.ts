import type { DocumentRecord } from "../../../core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../ports/document-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

interface DocumentRecordRow {
  readonly id: string;
  readonly provider: DocumentRecord["provider"];
  readonly external_id: string;
  readonly name: string;
  readonly url: string;
  readonly status: DocumentRecord["status"];
  readonly created_at: string;
  readonly updated_at: string;
}

export class SqliteDocumentRepository implements DocumentRepositoryPort {
  constructor(private readonly database: SqliteDatabase) {}

  async saveDocument(document: DocumentRecord): Promise<void> {
    this.database
      .prepare(
        `
          insert into documents (
            id,
            provider,
            external_id,
            name,
            url,
            status,
            created_at,
            updated_at
          )
          values (
            @id,
            @provider,
            @externalId,
            @name,
            @url,
            @status,
            @createdAt,
            @updatedAt
          )
          on conflict(id) do update set
            provider = excluded.provider,
            external_id = excluded.external_id,
            name = excluded.name,
            url = excluded.url,
            status = excluded.status,
            updated_at = excluded.updated_at
        `
      )
      .run({
        id: document.id,
        provider: document.provider,
        externalId: document.externalId,
        name: document.name,
        url: document.url,
        status: document.status,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString()
      });
  }

  async findDocumentByExternalId(
    provider: DocumentRecord["provider"],
    externalId: string
  ): Promise<DocumentRecord | undefined> {
    const row = this.database
      .prepare(
        `
          select
            id,
            provider,
            external_id,
            name,
            url,
            status,
            created_at,
            updated_at
          from documents
          where provider = ? and external_id = ?
        `
      )
      .get(provider, externalId) as DocumentRecordRow | undefined;

    return row ? toDocumentRecord(row) : undefined;
  }
}

function toDocumentRecord(row: DocumentRecordRow): DocumentRecord {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    name: row.name,
    url: row.url,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}
