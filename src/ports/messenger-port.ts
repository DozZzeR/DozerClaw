import type { OutboundReply } from "../core/domain/messaging/reply.js";

export interface MessengerPort {
  sendReply(reply: OutboundReply): Promise<void>;
}
