import type {
  AttachmentDownloadPort,
  DownloadAttachmentInput,
  DownloadedAttachment
} from "../../../ports/attachment-download-port.js";
import type { TelegramFileApi } from "./telegram-api.js";

export interface TelegramAttachmentDownloaderOptions {
  readonly telegram: TelegramFileApi;
  readonly token: string;
  readonly maxBytes?: number;
}

export class TelegramAttachmentDownloader implements AttachmentDownloadPort {
  constructor(private readonly options: TelegramAttachmentDownloaderOptions) {}

  async downloadAttachment(
    input: DownloadAttachmentInput
  ): Promise<DownloadedAttachment> {
    if (input.provider !== "telegram") {
      throw new Error(`Unsupported attachment provider: ${input.provider}`);
    }

    if (
      this.options.maxBytes !== undefined &&
      input.sizeBytes !== undefined &&
      input.sizeBytes > this.options.maxBytes
    ) {
      throw new Error(
        `Telegram attachment exceeds max size: ${input.sizeBytes} bytes > ${this.options.maxBytes} bytes`
      );
    }

    const file = await this.options.telegram.getFile(input.providerFileId);

    if (!file.file_path) {
      throw new Error("Telegram file response did not include file_path");
    }

    const bytes = await this.options.telegram.downloadFile(
      `https://api.telegram.org/file/bot${this.options.token}/${file.file_path}`,
      {
        ...(this.options.maxBytes !== undefined
          ? { maxBytes: this.options.maxBytes }
          : {})
      }
    );

    return {
      fileName: input.fileName ?? fileNameFromPath(file.file_path),
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      bytes
    };
  }
}

function fileNameFromPath(path: string): string {
  return path.split("/").at(-1) || "telegram-file";
}
