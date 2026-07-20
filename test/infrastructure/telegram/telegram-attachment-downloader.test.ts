import { describe, expect, it } from "vitest";

import { TelegramAttachmentDownloader } from "../../../src/infrastructure/providers/telegram/telegram-attachment-downloader.js";

describe("TelegramAttachmentDownloader", () => {
  it("downloads Telegram file bytes through Bot API file path", async () => {
    const telegram = new FakeTelegramFileApi();
    const downloader = new TelegramAttachmentDownloader({
      telegram,
      token: "bot-token",
      maxBytes: 10
    });

    const downloaded = await downloader.downloadAttachment({
      provider: "telegram",
      providerFileId: "telegram-file-1",
      fileName: "report.pdf",
      mimeType: "application/pdf"
    });

    expect(telegram.fileIds).toEqual(["telegram-file-1"]);
    expect(telegram.downloadUrls).toEqual([
      "https://api.telegram.org/file/botbot-token/documents/report.pdf"
    ]);
    expect(telegram.downloadOptions).toEqual([{ maxBytes: 10 }]);
    expect(downloaded).toEqual({
      fileName: "report.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3])
    });
  });

  it("rejects non-Telegram providers", async () => {
    const downloader = new TelegramAttachmentDownloader({
      telegram: new FakeTelegramFileApi(),
      token: "bot-token"
    });

    await expect(
      downloader.downloadAttachment({
        provider: "other",
        providerFileId: "file-1"
      })
    ).rejects.toThrow("Unsupported attachment provider");
  });

  it("rejects declared oversized Telegram files before lookup/download", async () => {
    const telegram = new FakeTelegramFileApi();
    const downloader = new TelegramAttachmentDownloader({
      telegram,
      token: "bot-token",
      maxBytes: 2
    });

    await expect(
      downloader.downloadAttachment({
        provider: "telegram",
        providerFileId: "telegram-file-1",
        fileName: "report.pdf",
        sizeBytes: 3
      })
    ).rejects.toThrow("Telegram attachment exceeds max size");
    expect(telegram.fileIds).toEqual([]);
    expect(telegram.downloadUrls).toEqual([]);
  });
});

class FakeTelegramFileApi {
  readonly fileIds: string[] = [];
  readonly downloadUrls: string[] = [];
  readonly downloadOptions: unknown[] = [];

  async getFile(fileId: string) {
    this.fileIds.push(fileId);

    return {
      file_path: "documents/report.pdf"
    };
  }

  async downloadFile(url: string, options?: unknown) {
    this.downloadUrls.push(url);
    this.downloadOptions.push(options);

    return new Uint8Array([1, 2, 3]);
  }
}
