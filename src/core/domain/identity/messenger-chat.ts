import type { ChatContextKind } from "./chat-context.js";

export interface MessengerChat {
  readonly id: string;
  readonly provider: string;
  readonly providerChatId: string;
  readonly kind: ChatContextKind;
  readonly approved: boolean;
}
