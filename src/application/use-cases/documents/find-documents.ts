import type { DocumentRecord } from "../../../core/domain/documents/document-record.js";
import type { DocumentType } from "../../../core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../ports/document-repository-port.js";
import type { MemoryPort } from "../../../ports/memory-port.js";

export interface FindDocumentsDependencies {
  readonly repository: DocumentRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly limit: number;
}

export interface FindDocumentRequestInput {
  readonly query?: string;
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
}

export interface FindDocumentsInput extends FindDocumentRequestInput {
  readonly requests?: readonly FindDocumentRequestInput[];
}

export interface FindDocumentsResult {
  readonly text: string;
}

export class FindDocumentsUseCase {
  constructor(private readonly dependencies: FindDocumentsDependencies) {}

  async execute(input: FindDocumentsInput): Promise<FindDocumentsResult> {
    const matchedDocuments: DocumentRecord[] = [];

    for (const request of expandFindDocumentRequests(input)) {
      matchedDocuments.push(...(await this.findDocumentsForRequest(request)));
    }

    const documents = deduplicateDocuments(matchedDocuments).slice(
      0,
      this.dependencies.limit
    );

    if (documents.length === 0) {
      return {
        text: "No registered documents matched that request."
      };
    }

    return {
      text: formatDocumentsReply(documents)
    };
  }

  private async findDocumentsForRequest(
    input: FindDocumentRequestInput
  ): Promise<readonly DocumentRecord[]> {
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

    return resolvedDocuments;
  }

  private async searchSemanticDocuments(
    input: FindDocumentRequestInput
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
    input: FindDocumentRequestInput
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
  input: FindDocumentRequestInput
): boolean {
  if (input.documentType && document.documentType !== input.documentType) {
    return false;
  }

  if (input.subjectId && document.subjectId !== input.subjectId) {
    return false;
  }

  return document.status === "registered";
}

function expandFindDocumentRequests(
  input: FindDocumentsInput
): readonly FindDocumentRequestInput[] {
  const requests = input.requests
    ?.map((request) =>
      buildFindDocumentRequest(
        request.query,
        request.documentType ?? input.documentType,
        request.subjectId ?? input.subjectId
      )
    )
    .filter(hasFindDocumentRequestFields);

  if (requests && requests.length > 0) {
    return requests;
  }

  return [
    {
      ...(input.query ? { query: input.query } : {}),
      ...(input.documentType ? { documentType: input.documentType } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {})
    }
  ];
}

function buildFindDocumentRequest(
  query: string | undefined,
  documentType: DocumentType | undefined,
  subjectId: string | undefined
): FindDocumentRequestInput {
  return {
    ...(query ? { query } : {}),
    ...(documentType ? { documentType } : {}),
    ...(subjectId ? { subjectId } : {})
  };
}

function hasFindDocumentRequestFields(
  request: FindDocumentRequestInput
): boolean {
  return Boolean(request.query || request.documentType || request.subjectId);
}

function formatDocumentsReply(documents: readonly DocumentRecord[]): string {
  return [
    "Registered documents:",
    ...documents.flatMap((document) => [
      `- ${document.name}${formatDocumentMetadata(document)}`,
      `  ${formatDocumentUrl(document)}`
    ])
  ].join("\n");
}

function formatDocumentUrl(document: DocumentRecord): string {
  if (document.provider === "google_drive") {
    return `https://drive.google.com/open?id=${encodeURIComponent(document.externalId)}`;
  }

  return document.url;
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
  const aliasContext = normalizedAliasContext(query, input);

  if (input.documentType) {
    tokens.add(input.documentType);
  }

  if (input.subjectId) {
    tokens.add(input.subjectId);
  }

  addFamilySubjectAliasTokens(tokens, aliasContext);

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
    tokens.add("goryainov");
    tokens.add("goryaynov");
  }

  if (hasAny(tokens, ["вики", "вика", "виктория", "victoria", "vika", "viki"])) {
    tokens.add("victoria");
    tokens.add("goryainova");
    tokens.add("goryainovava");
    tokens.add("goryaynovava");
  }

  if (hasAny(tokens, ["софия", "софьи", "sofia", "sophia"])) {
    tokens.add("sofia");
    tokens.add("goryainova");
    tokens.add("goryainovasa");
    tokens.add("goryaynovasa");
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

  const requestedSubject = requestedFallbackSubject(queryTokens, input);

  if (
    requestedSubject &&
    !fallbackDocumentMatchesSubject(document, requestedSubject)
  ) {
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

interface NormalizedAliasContext {
  readonly text: string;
  readonly compactText: string;
  readonly tokens: ReadonlySet<string>;
}

function normalizedAliasContext(
  query: string,
  input: FindDocumentsInput
): NormalizedAliasContext {
  const text = normalizeText([query, input.subjectId].filter(Boolean).join(" "));

  return {
    text,
    compactText: text.replace(/\s+/gu, ""),
    tokens: new Set(text.split(/\s+/u).filter(Boolean))
  };
}

function addFamilySubjectAliasTokens(
  tokens: Set<string>,
  context: NormalizedAliasContext
): void {
  if (looksLikeAlexeyFamilyAlias(context)) {
    tokens.add("alexey");
    tokens.add("горяйнов");
    tokens.add("goryainov");
    tokens.add("goryaynov");
  }

  if (looksLikeVictoriaFamilyAlias(context)) {
    tokens.add("victoria");
    tokens.add("goryainovava");
    tokens.add("goryaynovava");
    tokens.add("горяйновава");
  }

  if (looksLikeSofiaFamilyAlias(context)) {
    tokens.add("sofia");
    tokens.add("goryainovasa");
    tokens.add("goryaynovasa");
    tokens.add("горяйноваса");
  }
}

function looksLikeAlexeyFamilyAlias(context: NormalizedAliasContext): boolean {
  return hasAny(context.tokens, ["горяйнов", "goryainov", "goryaynov"]);
}

function looksLikeVictoriaFamilyAlias(
  context: NormalizedAliasContext
): boolean {
  const hasFemaleSurname = hasAny(context.tokens, [
    "горяйнова",
    "goryainova",
    "goryaynova"
  ]);

  return (
    hasAny(context.tokens, ["victoria", "vika", "viki", "виктория", "вика", "вики"]) ||
    (hasFemaleSurname && hasAny(context.tokens, ["va", "v", "ва", "в"])) ||
    /(goryainovava|goryaynovava|горяйновава)/u.test(context.compactText)
  );
}

function looksLikeSofiaFamilyAlias(context: NormalizedAliasContext): boolean {
  const hasFemaleSurname = hasAny(context.tokens, [
    "горяйнова",
    "goryainova",
    "goryaynova"
  ]);

  return (
    hasAny(context.tokens, ["sofia", "sophia", "софия", "софьи"]) ||
    (hasFemaleSurname && hasAny(context.tokens, ["sa", "s", "са", "с"])) ||
    /(goryainovasa|goryaynovasa|горяйноваса)/u.test(context.compactText)
  );
}

function requestedFallbackSubject(
  queryTokens: ReadonlySet<string>,
  input: FindDocumentsInput
): string | undefined {
  if (input.subjectId) {
    return input.subjectId;
  }

  const subjects = ["alexey", "victoria", "sofia"].filter((subject) =>
    queryTokens.has(subject)
  );

  return subjects.length === 1 ? subjects[0] : undefined;
}

function fallbackDocumentMatchesSubject(
  document: DocumentRecord,
  subjectId: string
): boolean {
  if (document.subjectId) {
    return document.subjectId === subjectId;
  }

  const context = normalizedAliasContext(
    [document.name, document.externalId].join(" "),
    {}
  );

  if (subjectId === "alexey") {
    return looksLikeAlexeyFamilyAlias(context);
  }

  if (subjectId === "victoria") {
    return looksLikeVictoriaFamilyAlias(context);
  }

  if (subjectId === "sofia") {
    return looksLikeSofiaFamilyAlias(context);
  }

  return false;
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
