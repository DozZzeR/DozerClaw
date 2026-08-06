import { describe, expect, it } from "vitest";

import { ProcessReceiptWarrantyUploadUseCase } from "../../../../src/application/use-cases/documents/process-receipt-warranty-upload.js";
import type { DocumentRecord } from "../../../../src/core/domain/documents/document-record.js";

describe("ProcessReceiptWarrantyUploadUseCase", () => {
  it("stores receipt descriptions and creates warranty reminders", async () => {
    const documentSearchDescriptionRecorder =
      new FakeDocumentSearchDescriptionRecorder();
    const planningTaskManager = new FakePlanningTaskManager();
    const useCase = new ProcessReceiptWarrantyUploadUseCase({
      documentSearchDescriptionRecorder,
      planningTaskManager
    });

    await expect(
      useCase.execute({
        documents: [documentRecord({ documentType: "receipt" })],
        documentType: "receipt",
        description: "чек на дрель Bosch, гарантия 2 года",
        receivedAt: new Date("2026-07-02T20:00:00.000Z"),
        actorId: "actor-owner"
      })
    ).resolves.toEqual({
      documents: [
        {
          ...documentRecord({ documentType: "receipt" }),
          semanticMemoryEntryId: "drawer-document-1"
        }
      ],
      replyLines: ["Создал напоминание по гарантии на 2028-07-02."]
    });
    expect(documentSearchDescriptionRecorder.seenInput).toEqual({
      document: documentRecord({ documentType: "receipt" }),
      description: "чек на дрель Bosch, гарантия 2 года"
    });
    expect(planningTaskManager.seenInput).toEqual({
      action: "create",
      title: "Проверить гарантию: чек на дрель Bosch, гарантия 2 года (passport.pdf)",
      date: "2028-07-02",
      actorId: "actor-owner"
    });
  });

  it("does not process non-receipt documents", async () => {
    const documentSearchDescriptionRecorder =
      new FakeDocumentSearchDescriptionRecorder();
    const planningTaskManager = new FakePlanningTaskManager();
    const useCase = new ProcessReceiptWarrantyUploadUseCase({
      documentSearchDescriptionRecorder,
      planningTaskManager
    });

    await expect(
      useCase.execute({
        documents: [documentRecord({ documentType: "identity" })],
        documentType: "identity",
        description: "passport with warranty 2 years",
        receivedAt: new Date("2026-07-02T20:00:00.000Z"),
        actorId: "actor-owner"
      })
    ).resolves.toEqual({
      documents: [documentRecord({ documentType: "identity" })],
      replyLines: []
    });
    expect(documentSearchDescriptionRecorder.seenInput).toBeUndefined();
    expect(planningTaskManager.seenInput).toBeUndefined();
  });
});

class FakeDocumentSearchDescriptionRecorder {
  seenInput:
    | {
        document: DocumentRecord;
        description: string;
      }
    | undefined;

  async execute(input: { document: DocumentRecord; description: string }) {
    this.seenInput = input;

    return {
      status: "stored" as const,
      document: {
        ...input.document,
        semanticMemoryEntryId: "drawer-document-1"
      }
    };
  }
}

class FakePlanningTaskManager {
  seenInput: unknown;

  async execute(input: unknown) {
    this.seenInput = input;

    return {
      status: "created" as const,
      item: {
        id: "T-created",
        title: "Check warranty",
        status: "open"
      },
      text: "Created task"
    };
  }
}

function documentRecord(input: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: input.id ?? "document-1",
    provider: "google_drive",
    externalId: input.externalId ?? "drive-passport",
    name: input.name ?? "passport.pdf",
    url: input.url ?? "https://drive.google.com/file/d/drive-passport",
    ...(input.documentType ? { documentType: input.documentType } : {}),
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    status: input.status ?? "registered",
    createdAt: input.createdAt ?? new Date("2026-07-02T20:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-07-02T20:00:00.000Z"),
    ...(input.semanticMemoryEntryId
      ? { semanticMemoryEntryId: input.semanticMemoryEntryId }
      : {})
  };
}
