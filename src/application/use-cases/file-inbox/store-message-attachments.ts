import type { FileInboxRecord } from "../../../core/domain/file-inbox/file-inbox-record.js";
import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { AttachmentDownloadPort } from "../../../ports/attachment-download-port.js";
import type { StoreInboundFileInput } from "./store-inbound-file.js";

export interface StoreMessageAttachmentsDependencies {
  readonly attachmentDownloader: AttachmentDownloadPort;
  readonly fileStore: InboundFileStore;
}

export interface InboundFileStore {
  execute(input: StoreInboundFileInput): Promise<FileInboxRecord>;
}

export interface StoreMessageAttachmentsInput {
  readonly provider: string;
  readonly receivedAt: Date;
  readonly attachments: readonly MessageAttachment[];
}

export class StoreMessageAttachmentsUseCase {
  constructor(
    private readonly dependencies: StoreMessageAttachmentsDependencies
  ) {}

  async execute(
    input: StoreMessageAttachmentsInput
  ): Promise<readonly FileInboxRecord[]> {
    const records: FileInboxRecord[] = [];

    for (const attachment of input.attachments) {
      if (!attachment.providerFileId) {
        continue;
      }

      const downloaded =
        await this.dependencies.attachmentDownloader.downloadAttachment({
          provider: input.provider,
          providerFileId: attachment.providerFileId,
          ...(attachment.fileName ? { fileName: attachment.fileName } : {}),
          ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
          ...(attachment.sizeBytes ? { sizeBytes: attachment.sizeBytes } : {})
        });

      records.push(
        await this.dependencies.fileStore.execute({
          fileName: downloaded.fileName,
          ...(downloaded.mimeType ? { mimeType: downloaded.mimeType } : {}),
          bytes: downloaded.bytes,
          receivedAt: input.receivedAt
        })
      );
    }

    return records;
  }
}
