import type { Notification } from "../core/domain/notifications/notification.js";

export type NotificationRecord = Notification;

export interface StoredNotification extends NotificationRecord {
  readonly recipientActorIds: readonly string[];
}

export interface NotificationRepositoryPort {
  createNotification(input: {
    readonly notification: NotificationRecord;
    readonly recipientActorIds: readonly string[];
  }): Promise<StoredNotification>;
  listUnreadForActor(actorId: string): Promise<readonly NotificationRecord[]>;
  markRead(input: {
    readonly notificationId: string;
    readonly actorId: string;
    readonly readAt: Date;
  }): Promise<void>;
}
