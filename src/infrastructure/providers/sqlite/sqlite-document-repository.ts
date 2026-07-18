import type { DocumentRecord } from "../../../core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../ports/document-repository-port.js";
import type { SearchDocumentsInput } from "../../../ports/document-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

interface DocumentRecordRow {
  readonly id: string;
  readonly provider: DocumentRecord["provider"];
  readonly external_id: string;
  readonly name: string;
  readonly url: string;
  readonly document_type: DocumentRecord["documentType"] | null;
  readonly subject_id: string | null;
  readonly semantic_memory_entry_id: string | null;
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
            document_type,
            subject_id,
            semantic_memory_entry_id,
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
            @documentType,
            @subjectId,
            @semanticMemoryEntryId,
            @status,
            @createdAt,
            @updatedAt
          )
          on conflict(id) do update set
            provider = excluded.provider,
            external_id = excluded.external_id,
            name = excluded.name,
            url = excluded.url,
            document_type = excluded.document_type,
            subject_id = excluded.subject_id,
            semantic_memory_entry_id = excluded.semantic_memory_entry_id,
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
        documentType: document.documentType ?? null,
        subjectId: document.subjectId ?? null,
        semanticMemoryEntryId: document.semanticMemoryEntryId ?? null,
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
            document_type,
            subject_id,
            semantic_memory_entry_id,
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

  async searchDocuments(
    input: SearchDocumentsInput
  ): Promise<readonly DocumentRecord[]> {
    const conditions = ["status = 'registered'"];
    const parameters: Record<string, string | number> = {
      limit: input.limit
    };

    if (input.documentType) {
      conditions.push("document_type = @documentType");
      parameters.documentType = input.documentType;
    }

    if (input.subjectId) {
      conditions.push("subject_id = @subjectId");
      parameters.subjectId = input.subjectId;
    }

    if (input.query?.trim()) {
      conditions.push(`
        (
          lower(name) like @query
          or lower(url) like @query
          or lower(external_id) like @query
          or lower(coalesce(document_type, '')) like @query
          or lower(coalesce(subject_id, '')) like @query
        )
      `);
      parameters.query = `%${input.query.trim().toLowerCase()}%`;
    }

    const rows = this.database
      .prepare(
        `
          select
            id,
            provider,
            external_id,
            name,
            url,
            document_type,
            subject_id,
            semantic_memory_entry_id,
            status,
            created_at,
            updated_at
          from documents
          where ${conditions.join(" and ")}
          order by updated_at desc, created_at desc
          limit @limit
        `
      )
      .all(parameters) as DocumentRecordRow[];

    return rows.map(toDocumentRecord);
  }
}

function toDocumentRecord(row: DocumentRecordRow): DocumentRecord {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    name: row.name,
    url: row.url,
    ...(row.document_type ? { documentType: row.document_type } : {}),
    ...(row.subject_id ? { subjectId: row.subject_id } : {}),
    ...(row.semantic_memory_entry_id
      ? { semanticMemoryEntryId: row.semantic_memory_entry_id }
      : {}),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}
