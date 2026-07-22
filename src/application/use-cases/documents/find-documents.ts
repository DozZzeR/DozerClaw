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
    const fallbackDocuments =
      documents.length === 0 ? await this.searchFallbackDocuments(input) : [];
    const resolvedDocuments =
      documents.length > 0 ? documents : fallbackDocuments;

    if (resolvedDocuments.length === 0) {
      return {
        text: "No registered documents matched that request."
      };
    }

    return {
      text: [
        "Registered documents:",
        ...resolvedDocuments.flatMap((document) => [
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

  private async searchFallbackDocuments(
    input: FindDocumentsInput
  ): Promise<readonly DocumentRecord[]> {
    const query = input.query?.trim();

    if (!query) {
      return [];
    }

    const candidates = await this.dependencies.repository.searchDocuments({
      ...(input.documentType ? { documentType: input.documentType } : {}),
      limit: this.dependencies.limit * 5
    });
    const queryTokens = expandedQueryTokens(query, input);

    return candidates
      .map((document) => ({
        document,
        score: scoreFallbackDocument(document, queryTokens, input)
      }))
      .filter((candidate) => candidate.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.document.updatedAt.getTime() - a.document.updatedAt.getTime()
      )
      .map((candidate) => candidate.document)
      .slice(0, this.dependencies.limit);
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

function expandedQueryTokens(
  query: string,
  input: FindDocumentsInput
): ReadonlySet<string> {
  const tokens = new Set(normalizedTokens(query));

  if (input.documentType) {
    tokens.add(input.documentType);
  }

  if (input.subjectId) {
    tokens.add(input.subjectId);
  }

  if (hasAny(tokens, ["паспорт", "ласпорт", "passport"])) {
    tokens.add("passport");
    tokens.add("паспорт");
  }

  if (hasAny(tokens, ["личная", "личную", "карта", "karta", "licna", "lična", "id"])) {
    tokens.add("id");
    tokens.add("karta");
    tokens.add("licna");
    tokens.add("личная");
    tokens.add("карта");
  }

  if (hasAny(tokens, ["алексея", "алексей", "alexey"])) {
    tokens.add("alexey");
    tokens.add("горяйнов");
  }

  if (hasAny(tokens, ["вики", "вика", "виктория", "victoria"])) {
    tokens.add("victoria");
    tokens.add("goryainova");
    tokens.add("goryainovava");
  }

  return tokens;
}

function scoreFallbackDocument(
  document: DocumentRecord,
  queryTokens: ReadonlySet<string>,
  input: FindDocumentsInput
): number {
  if (input.documentType && document.documentType !== input.documentType) {
    return 0;
  }

  const documentTokens = new Set(
    normalizedTokens(
      [
        document.name,
        document.documentType,
        document.subjectId,
        document.externalId
      ]
        .filter(Boolean)
        .join(" ")
    )
  );
  let score = 0;

  for (const token of queryTokens) {
    if (documentTokens.has(token)) {
      score += token.length >= 5 ? 2 : 1;
      continue;
    }

    if (
      token.length >= 5 &&
      [...documentTokens].some((documentToken) => documentToken.includes(token))
    ) {
      score += 1;
    }
  }

  if (input.documentType && document.documentType === input.documentType) {
    score += queryLooksLikeDocumentLookup(queryTokens) ? 1 : 0;
  }

  return score;
}

function normalizedTokens(value: string): readonly string[] {
  return normalizeText(value)
    .split(/\s+/u)
    .filter((token) => token.length >= 2);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[čć]/gu, "c")
    .replace(/[š]/gu, "s")
    .replace(/[ž]/gu, "z")
    .replace(/[đ]/gu, "d")
    .replace(/[^a-zа-яё0-9]+/giu, " ");
}

function hasAny(tokens: ReadonlySet<string>, values: readonly string[]): boolean {
  return values.some((value) => tokens.has(value));
}

function queryLooksLikeDocumentLookup(tokens: ReadonlySet<string>): boolean {
  return hasAny(tokens, [
    "identity",
    "passport",
    "паспорт",
    "id",
    "karta",
    "licna",
    "личная",
    "карта"
  ]);
}
