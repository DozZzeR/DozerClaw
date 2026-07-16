import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/composition/build-app.js";
import { createSqliteDatabase } from "../../src/infrastructure/providers/sqlite/sqlite-database.js";
import type { AttachmentDownloadPort } from "../../src/ports/attachment-download-port.js";
import type {
  DocumentStoragePort,
  ResolveDocumentInput,
  ResolvedDocument,
  UploadDocumentInput
} from "../../src/ports/document-storage-port.js";

describe("buildApp attachment storage", () => {
  it("stores normalized Telegram attachments when an attachment downloader is composed", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const fileStorageRoot = join(directory, "file-inbox");
    const downloader = new FakeAttachmentDownloader();

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_FILE_STORAGE_ROOT: fileStorageRoot,
          NODE_ENV: "test"
        },
        attachmentDownloader: downloader
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        displayName: "Owner"
      });

      const reply = await app.handleNormalizedInboundMessage({
        messageId: "message-1",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "store this local inbox",
        attachments: [
          {
            id: "attachment-1",
            providerFileId: "telegram-file-1",
            fileName: "report.txt",
            mimeType: "text/plain",
            sizeBytes: 11
          }
        ],
        receivedAt: new Date("2026-07-04T12:00:00.000Z"),
        now: new Date("2026-07-04T12:00:00.000Z")
      });

      const database = createSqliteDatabase({ path: databasePath });
      const records = database
        .prepare(
          `
            select
              original_file_name as originalFileName,
              mime_type as mimeType,
              size_bytes as sizeBytes,
              received_at as receivedAt
            from file_inbox_records
          `
        )
        .all() as {
        originalFileName: string;
        mimeType: string | null;
        sizeBytes: number;
        receivedAt: string;
      }[];
      database.close();

      expect(reply.text).toBe("Saved 1 attachment(s).");
      expect(downloader.inputs).toEqual([
        {
          provider: "telegram",
          providerFileId: "telegram-file-1",
          fileName: "report.txt",
          mimeType: "text/plain",
          sizeBytes: 11
        }
      ]);
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual(
        expect.objectContaining({
          originalFileName: "report.txt",
          mimeType: "text/plain",
          sizeBytes: 11,
          receivedAt: "2026-07-04T12:00:00.000Z"
        })
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("asks for destination and uploads selected attachments to Drive documents", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const fileStorageRoot = join(directory, "file-inbox");
    const downloader = new FakeAttachmentDownloader();
    const documentStorage = new FakeDocumentStorage();

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_FILE_STORAGE_ROOT: fileStorageRoot,
          NODE_ENV: "test"
        },
        attachmentDownloader: downloader,
        documentStorage
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        displayName: "Owner"
      });

      const prompt = await app.handleNormalizedInboundMessage({
        messageId: "message-1",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "save this",
        attachments: [
          {
            id: "attachment-1",
            providerFileId: "telegram-file-1",
            fileName: "passport.pdf",
            mimeType: "application/pdf",
            sizeBytes: 11
          }
        ],
        receivedAt: new Date("2026-07-04T12:00:00.000Z"),
        now: new Date("2026-07-04T12:00:00.000Z")
      });

      expect(prompt.text).toBe(
        [
          "Куда сохранить файл: passport.pdf?",
          "Можно ответить:",
          "- local inbox",
          "- Google Drive"
        ].join("\n")
      );
      expect(downloader.inputs).toEqual([]);

      const uploaded = await app.handleNormalizedInboundMessage({
        messageId: "message-2",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "Google Drive",
        attachments: [],
        receivedAt: new Date("2026-07-04T12:01:00.000Z"),
        now: new Date("2026-07-04T12:01:00.000Z")
      });

      expect(uploaded.text).toBe(
        [
          "Uploaded 1 document(s) to Google Drive:",
          "- passport.pdf",
          "  https://drive.google.com/file/d/drive-passport"
        ].join("\n")
      );
      expect(documentStorage.uploads).toEqual([
        {
          fileName: "passport.pdf",
          mimeType: "application/pdf",
          bytes: new TextEncoder().encode("hello world")
        }
      ]);

      const database = createSqliteDatabase({ path: databasePath });
      const documents = database
        .prepare(
          `
            select
              provider,
              external_id as externalId,
              name,
              url,
              status
            from documents
          `
        )
        .all();
      database.close();

      expect(documents).toEqual([
        {
          provider: "google_drive",
          externalId: "drive-passport",
          name: "passport.pdf",
          url: "https://drive.google.com/file/d/drive-passport",
          status: "registered"
        }
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

class FakeAttachmentDownloader implements AttachmentDownloadPort {
  readonly inputs: Parameters<AttachmentDownloadPort["downloadAttachment"]>[0][] =
    [];

  async downloadAttachment(
    input: Parameters<AttachmentDownloadPort["downloadAttachment"]>[0]
  ) {
    this.inputs.push(input);

    return {
      fileName: input.fileName ?? "file",
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      bytes: new TextEncoder().encode("hello world")
    };
  }
}

class FakeDocumentStorage implements DocumentStoragePort {
  readonly uploads: UploadDocumentInput[] = [];

  async resolveDocument(_input: ResolveDocumentInput): Promise<ResolvedDocument> {
    throw new Error("should not resolve existing document");
  }

  async uploadDocument(input: UploadDocumentInput): Promise<ResolvedDocument> {
    this.uploads.push(input);

    return {
      externalId: "drive-passport",
      name: input.fileName,
      url: "https://drive.google.com/file/d/drive-passport"
    };
  }
}
