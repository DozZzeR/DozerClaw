import type { DocumentRecord } from "../../../core/domain/documents/document-record.js";
import type { DocumentType } from "../../../core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../ports/document-repository-port.js";

export interface FindDocumentsDependencies {
  readonly repository: DocumentRepositoryPort;
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
    const documents = await this.dependencies.repository.searchDocuments({
      ...(input.query ? { query: input.query } : {}),
      ...(input.documentType ? { documentType: input.documentType } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      limit: this.dependencies.limit
    });

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
