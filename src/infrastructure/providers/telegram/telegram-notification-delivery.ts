import type { NotificationDeliveryPort } from "../../../ports/notification-delivery-port.js";
import type { TelegramApi } from "./telegram-api.js";

export class TelegramNotificationDelivery implements NotificationDeliveryPort {
  constructor(private readonly options: { readonly telegram: TelegramApi }) {}

  async send(input: {
    readonly provider: string;
    readonly providerChatId: string;
    readonly text: string;
  }): Promise<void> {
    if (input.provider !== "telegram") {
      return;
    }

    await this.options.telegram.sendMessage(input.providerChatId, input.text);
  }
}
