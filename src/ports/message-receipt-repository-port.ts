import type { OutboundReply } from "../core/domain/messaging/reply.js";

export interface MessageReceiptKey {
  readonly provider: string;
  readonly providerChatId: string;
  readonly messageId: string;
}

export interface MessageReceiptRecord extends MessageReceiptKey {
  readonly reply: OutboundReply;
  readonly processedAt: Date;
}

export interface MessageReceiptRepositoryPort {
  find(key: MessageReceiptKey): Promise<OutboundReply | undefined>;
  save(receipt: MessageReceiptRecord): Promise<void>;
}
