import type { OutboundReply } from "../../../core/domain/messaging/reply.js";
import type {
  MessageReceiptKey,
  MessageReceiptRecord,
  MessageReceiptRepositoryPort
} from "../../../ports/message-receipt-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

interface MessageReceiptRow {
  readonly reply_chat_id: string;
  readonly reply_text: string;
}

export class SqliteMessageReceiptRepository
  implements MessageReceiptRepositoryPort
{
  constructor(private readonly database: SqliteDatabase) {}

  async find(key: MessageReceiptKey): Promise<OutboundReply | undefined> {
    const row = this.database
      .prepare(
        `
          select reply_chat_id, reply_text
          from processed_message_receipts
          where provider = @provider
            and provider_chat_id = @providerChatId
            and message_id = @messageId
        `
      )
      .get(key) as MessageReceiptRow | undefined;

    return row
      ? {
          chatId: row.reply_chat_id,
          text: row.reply_text
        }
      : undefined;
  }

  async save(receipt: MessageReceiptRecord): Promise<void> {
    this.database
      .prepare(
        `
          insert into processed_message_receipts (
            provider,
            provider_chat_id,
            message_id,
            reply_chat_id,
            reply_text,
            processed_at
          ) values (
            @provider,
            @providerChatId,
            @messageId,
            @replyChatId,
            @replyText,
            @processedAt
          )
          on conflict (provider, provider_chat_id, message_id) do nothing
        `
      )
      .run({
        provider: receipt.provider,
        providerChatId: receipt.providerChatId,
        messageId: receipt.messageId,
        replyChatId: receipt.reply.chatId,
        replyText: receipt.reply.text,
        processedAt: receipt.processedAt.toISOString()
      });
  }
}
