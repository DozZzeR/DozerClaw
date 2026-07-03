export interface AttachmentDownloadPort {
  downloadAttachment(
    input: DownloadAttachmentInput
  ): Promise<DownloadedAttachment>;
}

export interface DownloadAttachmentInput {
  readonly provider: string;
  readonly providerFileId: string;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}

export interface DownloadedAttachment {
  readonly fileName: string;
  readonly mimeType?: string;
  readonly bytes: Uint8Array;
}
