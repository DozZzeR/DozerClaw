import type { DocumentRecord } from "../../../core/domain/documents/document-record.js";
import type { DocumentType } from "../../../core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../ports/document-repository-port.js";
import type { MemoryPort } from "../../../ports/memory-port.js";

export interface FindDocumentsDependencies {
  readonly repository: DocumentRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly limit: number;
}

export interface FindDocumentsInput {
  readonly query?: string;
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
}

export interface FindDocumentsResult {
  readonly text: string;
}

export class FindDocumentsUseCase {
  constructor(private readonly dependencies: FindDocumentsDependencies) {}

  async execute(input: FindDocumentsInput): Promise<FindDocumentsResult> {
    const strictDocuments = await this.dependencies.repository.searchDocuments({
      ...(input.query ? { query: input.query } : {}),
      ...(input.documentType ? { documentType: input.documentType } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      limit: this.dependencies.limit
    });
    const semanticDocuments = await this.searchSemanticDocuments(input);
    const documents = deduplicateDocuments([
      ...strictDocuments,
      ...semanticDocuments
    ]).slice(0, this.dependencies.limit);

    if (documents.length === 0) {
      return {
        text: "No registered documents matched that request."
      };
    }

    return {
      text: [
        "Registered documents:",
        ...documents.flatMap((document) => [
          `- ${document.name}${formatDocumentMetadata(document)}`,
          `  ${document.url}`
        ])
      ].join("\n")
    };
  }

  private async searchSemanticDocuments(
    input: FindDocumentsInput
  ): Promise<readonly DocumentRecord[]> {
    const query = input.query?.trim();

    if (!query || !this.dependencies.semanticMemory) {
      return [];
    }

    try {
      const results = await this.dependencies.semanticMemory.search({
        text: query,
        limit: this.dependencies.limit
      });
      const ids = unique(results.flatMap((result) =>
        extractDocumentReferenceIds(result.entry.body)
      ));

      if (ids.length === 0) {
        return [];
      }

      const documents = await this.dependencies.repository.findDocumentsByIds(ids);

      return documents.filter((document) => matchesStructuredFilters(document, input));
    } catch {
      return [];
    }
  }
}

function extractDocumentReferenceIds(text: string): readonly string[] {
  return Array.from(text.matchAll(/\bdocument:([a-zA-Z0-9._:-]+)/g), (match) =>
    match[1] ?? ""
  ).filter((value) => value.length > 0);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

function deduplicateDocuments(
  documents: readonly DocumentRecord[]
): readonly DocumentRecord[] {
  const seen = new Set<string>();
  const deduplicated: DocumentRecord[] = [];

  for (const document of documents) {
    if (seen.has(document.id)) {
      continue;
    }

    seen.add(document.id);
    deduplicated.push(document);
  }

  return deduplicated;
}

function matchesStructuredFilters(
  document: DocumentRecord,
  input: FindDocumentsInput
): boolean {
  if (input.documentType && document.documentType !== input.documentType) {
    return false;
  }

  if (input.subjectId && document.subjectId !== input.subjectId) {
    return false;
  }

  return document.status === "registered";
}

function formatDocumentMetadata(document: DocumentRecord): string {
  const metadata = [
    document.documentType,
    document.subjectId ? `subject: ${document.subjectId}` : undefined
  ].filter((value): value is string => Boolean(value));

  if (metadata.length === 0) {
    return "";
  }

  return ` (${metadata.join(", ")})`;
}
