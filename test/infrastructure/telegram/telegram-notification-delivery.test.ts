import { describe, expect, it } from "vitest";

import { TelegramNotificationDelivery } from "../../../src/infrastructure/providers/telegram/telegram-notification-delivery.js";
import type { TelegramApi } from "../../../src/infrastructure/providers/telegram/telegram-api.js";

describe("TelegramNotificationDelivery", () => {
  it("sends Telegram notification pushes to provider chat ids", async () => {
    const telegram = new RecordingTelegramApi();
    const delivery = new TelegramNotificationDelivery({ telegram });

    await delivery.send({
      provider: "telegram",
      providerChatId: "tg-family",
      text: "Family task created"
    });
    await delivery.send({
      provider: "email",
      providerChatId: "email-family",
      text: "ignored"
    });

    expect(telegram.sent).toEqual([
      {
        chatId: "tg-family",
        text: "Family task created"
      }
    ]);
  });
});

class RecordingTelegramApi implements TelegramApi {
  readonly sent: { readonly chatId: string; readonly text: string }[] = [];

  async getUpdates() {
    return [];
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    this.sent.push({ chatId, text });
  }

  async deleteMessage(): Promise<void> {
    throw new Error("should not delete");
  }
}
