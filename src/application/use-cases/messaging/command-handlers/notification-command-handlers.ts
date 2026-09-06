import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type {
  DispatchAcceptedCommandInput,
  NotificationInbox
} from "../dispatch-accepted-command.js";
import { parseNotificationId } from "../dispatch-command-helpers.js";

export interface NotificationDependencies {
  readonly notifications?: NotificationInbox | undefined;
}

export async function handleListUnreadNotifications(
  context: AcceptedMessageContext,
  dependencies: NotificationDependencies
): Promise<OutboundReply> {
  if (!dependencies.notifications) {
    return {
      chatId: context.chat.id,
      text: "Notifications are not configured."
    };
  }

  const result = await dependencies.notifications.listUnread({
    actorId: context.actor.id
  });

  if (result.notifications.length === 0) {
    return {
      chatId: context.chat.id,
      text: "No unread notifications."
    };
  }

  return {
    chatId: context.chat.id,
    text: [
      "Unread notifications:",
      ...result.notifications.flatMap((notification, index) => [
        `${index + 1}. ${notification.title}`,
        ...notification.body.split("\n").map((line) => `   ${line}`),
        `   id: ${notification.id}`
      ])
    ].join("\n")
  };
}

export async function handleMarkNotificationRead(
  input: DispatchAcceptedCommandInput,
  dependencies: NotificationDependencies
): Promise<OutboundReply> {
  if (!dependencies.notifications) {
    return {
      chatId: input.context.chat.id,
      text: "Notifications are not configured."
    };
  }

  const notificationId = parseNotificationId(input.route.normalizedText);

  if (!notificationId) {
    return {
      chatId: input.context.chat.id,
      text: "Usage: /read <notificationId>."
    };
  }

  await dependencies.notifications.markRead({
    notificationId,
    actorId: input.context.actor.id
  });

  return {
    chatId: input.context.chat.id,
    text: `Marked notification ${notificationId} as read.`
  };
}
