export interface InboundMessage {
  readonly id: string;
  readonly chatId: string;
  readonly actorIdentityId: string;
  readonly text?: string;
  readonly attachments: readonly MessageAttachment[];
  readonly receivedAt: Date;
}

export interface MessageAttachment {
  readonly id: string;
  readonly providerFileId?: string;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}
