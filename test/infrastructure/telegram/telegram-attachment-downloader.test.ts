import { describe, expect, it } from "vitest";

import { TelegramAttachmentDownloader } from "../../../src/infrastructure/providers/telegram/telegram-attachment-downloader.js";

describe("TelegramAttachmentDownloader", () => {
  it("downloads Telegram file bytes through Bot API file path", async () => {
    const telegram = new FakeTelegramFileApi();
    const downloader = new TelegramAttachmentDownloader({
      telegram,
      token: "bot-token"
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
});

class FakeTelegramFileApi {
  readonly fileIds: string[] = [];
  readonly downloadUrls: string[] = [];

  async getFile(fileId: string) {
    this.fileIds.push(fileId);

    return {
      file_path: "documents/report.pdf"
    };
  }

  async downloadFile(url: string) {
    this.downloadUrls.push(url);

    return new Uint8Array([1, 2, 3]);
  }
}
