import type { DocumentRecord } from "../../../core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../ports/document-repository-port.js";
import type { MemoryPort } from "../../../ports/memory-port.js";

export interface RecordDocumentSearchDescriptionDependencies {
  readonly repository: DocumentRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly now: () => Date;
}

export interface RecordDocumentSearchDescriptionInput {
  readonly document: DocumentRecord;
  readonly description: string;
}

export type RecordDocumentSearchDescriptionResult =
  | {
      readonly status: "stored";
      readonly document: DocumentRecord;
    }
  | {
      readonly status: "semantic_unavailable";
      readonly document: DocumentRecord;
    };

export class RecordDocumentSearchDescriptionUseCase {
  constructor(
    private readonly dependencies: RecordDocumentSearchDescriptionDependencies
  ) {}

  async execute(
    input: RecordDocumentSearchDescriptionInput
  ): Promise<RecordDocumentSearchDescriptionResult> {
    const description = input.description.trim();

    if (!this.dependencies.semanticMemory) {
      return {
        status: "semantic_unavailable",
        document: input.document
      };
    }

    try {
      const entry = await this.dependencies.semanticMemory.store({
        body: documentSemanticBody(input.document, description),
        references: [
          `document:${input.document.id}`,
          `google_drive:${input.document.externalId}`
        ]
      });
      const document = {
        ...input.document,
        semanticMemoryEntryId: entry.id,
        updatedAt: this.dependencies.now()
      };

      await this.dependencies.repository.saveDocument(document);

      return {
        status: "stored",
        document
      };
    } catch {
      return {
        status: "semantic_unavailable",
        document: input.document
      };
    }
  }
}

function documentSemanticBody(
  document: DocumentRecord,
  description: string
): string {
  return [
    `Document: ${document.name}`,
    `User search description: ${description}`,
    ...(document.documentType ? [`Type: ${document.documentType}`] : []),
    ...(document.subjectId ? [`Subject: ${document.subjectId}`] : []),
    `Google Drive URL: ${document.url}`
  ].join("\n");
}
