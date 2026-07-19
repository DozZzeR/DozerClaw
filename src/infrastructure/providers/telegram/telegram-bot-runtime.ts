import type { DozerClawApp } from "../../../composition/app.js";
import type { ChatContextKind } from "../../../core/domain/identity/chat-context.js";
import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import { TelegramApiError } from "./telegram-api.js";
import type {
  TelegramApi,
  TelegramDocument,
  TelegramMessage,
  TelegramPhotoSize,
  TelegramUpdate,
  TelegramUser
} from "./telegram-api.js";

export interface TelegramBotRuntimeOptions {
  readonly app: DozerClawApp;
  readonly telegram: TelegramApi;
  readonly ownerUserId?: string;
  readonly pollingTimeoutSeconds?: number;
  readonly now?: () => Date;
  readonly onError?: (error: unknown) => void;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export class TelegramBotRuntime {
  private nextOffset: number | undefined;
  private stopped = false;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: TelegramBotRuntimeOptions) {
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? sleep;
  }

  stop(): void {
    this.stopped = true;
  }

  async start(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.pollOnce();
      } catch (error) {
        this.options.onError?.(error);
        await this.sleep(pollingBackoffMilliseconds(error));
      }
    }
  }

  async pollOnce(): Promise<void> {
    const updates = await this.options.telegram.getUpdates({
      ...(this.nextOffset !== undefined ? { offset: this.nextOffset } : {}),
      timeoutSeconds: this.options.pollingTimeoutSeconds ?? 30
    });

    for (const update of updates) {
      this.nextOffset = update.update_id + 1;
      await this.handleUpdate(update);
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    try {
      if (!update.message) {
        return;
      }

      const message = update.message;
      const from = message.from;

      if (!from) {
        return;
      }

      const providerUserId = String(from.id);
      const providerChatId = String(message.chat.id);
      const displayName = displayNameFromUser(from);

      if (
        this.options.ownerUserId &&
        providerUserId === this.options.ownerUserId &&
        message.chat.type === "private"
      ) {
        await this.options.app.bootstrapOwnerIdentity({
          provider: "telegram",
          providerUserId,
          providerChatId,
          displayName
        });
      }

      const reply = await this.options.app.handleNormalizedInboundMessage({
        messageId: String(message.message_id),
        provider: "telegram",
        providerUserId,
        providerChatId,
        chatKind: chatKindFromTelegram(message.chat.type, {
          isConfiguredOwner:
            this.options.ownerUserId !== undefined &&
            providerUserId === this.options.ownerUserId
        }),
        displayName,
        text: message.text ?? message.caption ?? "",
        attachments: attachmentsFromMessage(message),
        receivedAt: new Date(message.date * 1000),
        now: this.now()
      });

      await this.options.telegram.sendMessage(providerChatId, reply.text);
    } catch (error) {
      this.options.onError?.(error);
    }
  }
}

function chatKindFromTelegram(
  chatType: string,
  input: { readonly isConfiguredOwner: boolean }
): ChatContextKind {
  if (chatType === "private") {
    return input.isConfiguredOwner ? "owner_private" : "family_private";
  }

  return "family_group";
}

function attachmentsFromMessage(
  message: TelegramMessage
): readonly MessageAttachment[] {
  if (message.document) {
    return [attachmentFromDocument(message.document)];
  }

  if (message.photo && message.photo.length > 0) {
    const largest = [...message.photo].sort(
      (left, right) => right.width * right.height - left.width * left.height
    )[0];

    return largest ? [attachmentFromPhoto(largest)] : [];
  }

  return [];
}

function attachmentFromDocument(document: TelegramDocument): MessageAttachment {
  return {
    id: document.file_id,
    providerFileId: document.file_id,
    ...(document.file_name ? { fileName: document.file_name } : {}),
    ...(document.mime_type ? { mimeType: document.mime_type } : {}),
    ...(document.file_size ? { sizeBytes: document.file_size } : {})
  };
}

function attachmentFromPhoto(photo: TelegramPhotoSize): MessageAttachment {
  return {
    id: photo.file_id,
    providerFileId: photo.file_id,
    fileName: `${photo.file_id}.jpg`,
    mimeType: "image/jpeg",
    ...(photo.file_size ? { sizeBytes: photo.file_size } : {})
  };
}

function displayNameFromUser(user: TelegramUser): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");

  return name || user.username || String(user.id);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function pollingBackoffMilliseconds(error: unknown): number {
  return error instanceof TelegramApiError && error.isConflict ? 30000 : 1000;
}
