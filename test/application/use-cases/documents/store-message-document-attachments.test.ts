import { describe, expect, it } from "vitest";

import { StoreMessageDocumentAttachmentsUseCase } from "../../../../src/application/use-cases/documents/store-message-document-attachments.js";
import type { DocumentRecord } from "../../../../src/core/domain/documents/document-record.js";
import type { AttachmentDownloadPort } from "../../../../src/ports/attachment-download-port.js";
import type { DocumentRepositoryPort } from "../../../../src/ports/document-repository-port.js";
import type { DocumentStoragePort } from "../../../../src/ports/document-storage-port.js";

describe("StoreMessageDocumentAttachmentsUseCase", () => {
  it("downloads, uploads, and registers message attachments as Drive documents", async () => {
    const savedDocuments: DocumentRecord[] = [];
    const useCase = new StoreMessageDocumentAttachmentsUseCase({
      attachmentDownloader: {
        async downloadAttachment(input) {
          expect(input).toEqual({
            provider: "telegram",
            providerFileId: "telegram-file-1",
            fileName: "passport.pdf",
            mimeType: "application/pdf",
            sizeBytes: 3
          });

          return {
            fileName: "passport.pdf",
            mimeType: "application/pdf",
            bytes: new Uint8Array([1, 2, 3])
          };
        }
      } satisfies AttachmentDownloadPort,
      documentStorage: {
        async resolveDocument() {
          throw new Error("should not resolve existing document");
        },
        async uploadDocument(input) {
          expect(input).toEqual({
            fileName: "passport.pdf",
            mimeType: "application/pdf",
            bytes: new Uint8Array([1, 2, 3])
          });

          return {
            externalId: "drive-passport",
            name: "passport.pdf",
            url: "https://drive.google.com/file/d/drive-passport"
          };
        }
      } satisfies DocumentStoragePort,
      repository: {
        async saveDocument(document) {
          savedDocuments.push(document);
        },
        async findDocumentByExternalId() {
          return undefined;
        },
        async searchDocuments() {
          return [];
        }
      } satisfies DocumentRepositoryPort,
      generateId: () => "document-1",
      now: () => new Date("2026-07-16T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        provider: "telegram",
        receivedAt: new Date("2026-07-16T09:59:00.000Z"),
        documentType: "identity",
        subjectId: "max",
        attachments: [
          {
            id: "attachment-1",
            providerFileId: "telegram-file-1",
            fileName: "passport.pdf",
            mimeType: "application/pdf",
            sizeBytes: 3
          }
        ]
      })
    ).resolves.toEqual([
      {
        status: "uploaded",
        document: {
          id: "document-1",
          provider: "google_drive",
          externalId: "drive-passport",
          name: "passport.pdf",
          url: "https://drive.google.com/file/d/drive-passport",
          documentType: "identity",
          subjectId: "max",
          status: "registered",
          createdAt: new Date("2026-07-16T10:00:00.000Z"),
          updatedAt: new Date("2026-07-16T10:00:00.000Z")
        }
      }
    ]);
    expect(savedDocuments).toEqual([
      {
        id: "document-1",
        provider: "google_drive",
        externalId: "drive-passport",
        name: "passport.pdf",
        url: "https://drive.google.com/file/d/drive-passport",
        documentType: "identity",
        subjectId: "max",
        status: "registered",
        createdAt: new Date("2026-07-16T10:00:00.000Z"),
        updatedAt: new Date("2026-07-16T10:00:00.000Z")
      }
    ]);
  });
});
