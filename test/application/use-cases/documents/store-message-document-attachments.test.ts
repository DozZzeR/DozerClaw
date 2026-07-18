import { describe, expect, it } from "vitest";

import { StoreMessageDocumentAttachmentsUseCase } from "../../../../src/application/use-cases/documents/store-message-document-attachments.js";
import type { DocumentRecord } from "../../../../src/core/domain/documents/document-record.js";
import type { AttachmentDownloadPort } from "../../../../src/ports/attachment-download-port.js";
import type { DocumentFolderPolicyPort } from "../../../../src/ports/document-folder-policy-port.js";
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
        },
        async moveDocument() {
          throw new Error("should not move document");
        },
        async deleteDocument() {
          throw new Error("should not delete document");
        }
      } satisfies DocumentStoragePort,
      repository: {
        async saveDocument(document) {
          savedDocuments.push(document);
        },
        async findDocumentByExternalId() {
          return undefined;
        },
        async findDocumentsByIds() {
          return [];
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

  it("uploads to the best policy folder when a confident folder is resolved", async () => {
    const useCase = new StoreMessageDocumentAttachmentsUseCase({
      attachmentDownloader: {
        async downloadAttachment() {
          return {
            fileName: "GoryainovAV-lična karta.pdf",
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
            fileName: "GoryainovAV-lična karta.pdf",
            mimeType: "application/pdf",
            bytes: new Uint8Array([1, 2, 3]),
            targetFolderId: "folder-personal-alexey"
          });

          return {
            externalId: "drive-id",
            name: input.fileName,
            url: "https://drive.google.com/file/d/drive-id"
          };
        },
        async moveDocument() {
          throw new Error("should not move document");
        },
        async deleteDocument() {
          throw new Error("should not delete document");
        }
      } satisfies DocumentStoragePort,
      documentFolderPolicy: {
        resolveUploadFolder(input) {
          expect(input).toEqual({
            fileName: "GoryainovAV-lična karta.pdf",
            mimeType: "application/pdf",
            userText: "сохрани личную карту Алексея в гугл",
            documentType: "identity",
            subjectId: "alexey"
          });

          return {
            status: "resolved",
            path: "01_Личные_документы/Alexey",
            folderId: "folder-personal-alexey",
            confidence: 1
          };
        }
      } satisfies DocumentFolderPolicyPort,
      repository: {
        async saveDocument() {},
        async findDocumentByExternalId() {
          return undefined;
        },
        async findDocumentsByIds() {
          return [];
        },
        async searchDocuments() {
          return [];
        }
      } satisfies DocumentRepositoryPort,
      generateId: () => "document-1",
      now: () => new Date("2026-07-16T10:00:00.000Z")
    });

    await useCase.execute({
      provider: "telegram",
      receivedAt: new Date("2026-07-16T09:59:00.000Z"),
      userText: "сохрани личную карту Алексея в гугл",
      documentType: "identity",
      subjectId: "alexey",
      attachments: [
        {
          id: "attachment-1",
          providerFileId: "telegram-file-1",
          fileName: "GoryainovAV-lična karta.pdf",
          mimeType: "application/pdf",
          sizeBytes: 3
        }
      ]
    });
  });

  it("returns a folder choice instead of uploading when policy asks for a child folder", async () => {
    const useCase = new StoreMessageDocumentAttachmentsUseCase({
      attachmentDownloader: {
        async downloadAttachment() {
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
        async uploadDocument() {
          throw new Error("should not upload before folder choice");
        },
        async moveDocument() {
          throw new Error("should not move document");
        },
        async deleteDocument() {
          throw new Error("should not delete document");
        }
      } satisfies DocumentStoragePort,
      documentFolderPolicy: {
        resolveUploadFolder() {
          return {
            status: "needs_choice",
            path: "01_Личные_документы",
            folderId: "folder-personal",
            confidence: 0.6,
            options: [
              {
                path: "01_Личные_документы/Alexey",
                folderId: "folder-personal-alexey"
              },
              {
                path: "01_Личные_документы/Victoria",
                folderId: "folder-personal-victoria"
              }
            ]
          };
        }
      } satisfies DocumentFolderPolicyPort,
      repository: {
        async saveDocument() {
          throw new Error("should not save before folder choice");
        },
        async findDocumentByExternalId() {
          return undefined;
        },
        async findDocumentsByIds() {
          return [];
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
        userText: "сохрани паспорт",
        documentType: "identity",
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
        status: "needs_folder_choice",
        attachment: {
          fileName: "passport.pdf",
          mimeType: "application/pdf",
          bytes: new Uint8Array([1, 2, 3])
        },
        parentPath: "01_Личные_документы",
        parentFolderId: "folder-personal",
        options: [
          {
            path: "01_Личные_документы/Alexey",
            folderId: "folder-personal-alexey"
          },
          {
            path: "01_Личные_документы/Victoria",
            folderId: "folder-personal-victoria"
          }
        ],
        documentType: "identity"
      }
    ]);
  });
});
