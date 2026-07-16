import type { DocumentRecord } from "../../../core/domain/documents/document-record.js";
import type { DocumentType } from "../../../core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../ports/document-repository-port.js";

export interface ManageDocumentRecordDependencies {
  readonly repository: DocumentRepositoryPort;
  readonly now: () => Date;
}

export type ManageDocumentRecordInput =
  | {
      readonly action: "update_metadata";
      readonly query: string;
      readonly documentType?: DocumentType;
      readonly subjectId?: string;
      readonly document?: DocumentRecord;
    }
  | {
      readonly action: "archive";
      readonly query: string;
      readonly document?: DocumentRecord;
    };

export interface ManageDocumentRecordResult {
  readonly text: string;
  readonly pending?: {
    readonly action: Extract<
      ManageDocumentRecordInput,
      { readonly action: "update_metadata" | "archive" }
    >;
    readonly candidates: readonly DocumentRecord[];
  };
}

export class ManageDocumentRecordUseCase {
  constructor(
    private readonly dependencies: ManageDocumentRecordDependencies
  ) {}

  async execute(
    input: ManageDocumentRecordInput
  ): Promise<ManageDocumentRecordResult> {
    if (input.action === "update_metadata" && !hasMetadataUpdate(input)) {
      return {
        text: "Tell me the document type or subject to update."
      };
    }

    const candidates = input.document
      ? [input.document]
      : await this.dependencies.repository.searchDocuments({
          query: input.query,
          limit: 2
        });

    if (candidates.length === 0) {
      return {
        text: "No registered documents matched that request."
      };
    }

    if (candidates.length > 1) {
      return {
        text: [
          "I found multiple registered documents that could match.",
          ...candidates.map((document, index) => `${index + 1}. ${document.name}`),
          "Reply with the number to choose, or cancel."
        ].join("\n"),
        pending: {
          action: input,
          candidates
        }
      };
    }

    const document = input.document ?? candidates[0]!;

    if (input.action === "archive") {
      await this.dependencies.repository.saveDocument({
        ...document,
        status: "archived",
        updatedAt: this.dependencies.now()
      });

      return {
        text: `Archived document: ${document.name}`
      };
    }

    const updatedDocument: DocumentRecord = {
      ...document,
      ...(input.documentType ? { documentType: input.documentType } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      updatedAt: this.dependencies.now()
    };

    await this.dependencies.repository.saveDocument(updatedDocument);

    return {
      text: `Updated document: ${updatedDocument.name}${formatDocumentMetadata(updatedDocument)}`
    };
  }
}

function hasMetadataUpdate(
  input: Extract<ManageDocumentRecordInput, { readonly action: "update_metadata" }>
): boolean {
  return Boolean(input.documentType || input.subjectId);
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
