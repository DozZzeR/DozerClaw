import type { DocumentRecord } from "../../../core/domain/documents/document-record.js";
import type { DocumentType } from "../../../core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../ports/document-repository-port.js";
import type { DocumentStoragePort } from "../../../ports/document-storage-port.js";

export interface RegisterDocumentDependencies {
  readonly repository: DocumentRepositoryPort;
  readonly storage: DocumentStoragePort;
  readonly generateId: () => string;
  readonly now: () => Date;
}

export interface RegisterDocumentInput {
  readonly externalIdOrUrl: string;
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
}

export interface RegisterDocumentResult {
  readonly status: "registered";
  readonly document: DocumentRecord;
}

export class RegisterDocumentUseCase {
  constructor(private readonly dependencies: RegisterDocumentDependencies) {}

  async execute(input: RegisterDocumentInput): Promise<RegisterDocumentResult> {
    const resolved = await this.dependencies.storage.resolveDocument({
      externalIdOrUrl: input.externalIdOrUrl
    });
    const existing = await this.dependencies.repository.findDocumentByExternalId(
      "google_drive",
      resolved.externalId
    );
    const now = this.dependencies.now();
    const documentType = input.documentType ?? existing?.documentType;
    const subjectId = input.subjectId ?? existing?.subjectId;
    const document: DocumentRecord = {
      id: existing?.id ?? this.dependencies.generateId(),
      provider: "google_drive",
      externalId: resolved.externalId,
      name: resolved.name,
      url: resolved.url,
      ...(documentType ? { documentType } : {}),
      ...(subjectId ? { subjectId } : {}),
      status: "registered",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    await this.dependencies.repository.saveDocument(document);

    return {
      status: "registered",
      document
    };
  }
}
