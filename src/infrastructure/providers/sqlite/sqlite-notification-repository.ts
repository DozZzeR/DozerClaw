import type { NotificationScope } from "../../../core/domain/notifications/notification.js";
import type {
  NotificationRecord,
  NotificationRepositoryPort,
  StoredNotification
} from "../../../ports/notification-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

interface NotificationRow {
  readonly id: string;
  readonly scope: NotificationScope;
  readonly title: string;
  readonly body: string;
  readonly source_kind: string | null;
  readonly source_id: string | null;
  readonly created_by_actor_id: string | null;
  readonly created_at: string;
}

export class SqliteNotificationRepository implements NotificationRepositoryPort {
  constructor(private readonly database: SqliteDatabase) {}

  async createNotification(input: {
    readonly notification: NotificationRecord;
    readonly recipientActorIds: readonly string[];
  }): Promise<StoredNotification> {
    const insertNotification = this.database.prepare(
      `
        insert into notifications (
          id,
          scope,
          title,
          body,
          source_kind,
          source_id,
          created_by_actor_id,
          created_at
        )
        values (
          @id,
          @scope,
          @title,
          @body,
          @sourceKind,
          @sourceId,
          @createdByActorId,
          @createdAt
        )
      `
    );
    const insertDelivery = this.database.prepare(
      `
        insert or ignore into notification_deliveries (
          notification_id,
          actor_id
        )
        values (?, ?)
      `
    );
    const create = this.database.transaction(() => {
      insertNotification.run({
        id: input.notification.id,
        scope: input.notification.scope,
        title: input.notification.title,
        body: input.notification.body,
        sourceKind: input.notification.sourceKind ?? null,
        sourceId: input.notification.sourceId ?? null,
        createdByActorId: input.notification.createdByActorId ?? null,
        createdAt: input.notification.createdAt.toISOString()
      });

      for (const actorId of input.recipientActorIds) {
        insertDelivery.run(input.notification.id, actorId);
      }
    });

    create();

    return {
      ...input.notification,
      recipientActorIds: input.recipientActorIds
    };
  }

  async listUnreadForActor(
    actorId: string
  ): Promise<readonly NotificationRecord[]> {
    const rows = this.database
      .prepare(
        `
          select
            notifications.id,
            notifications.scope,
            notifications.title,
            notifications.body,
            notifications.source_kind,
            notifications.source_id,
            notifications.created_by_actor_id,
            notifications.created_at
          from notification_deliveries
          inner join notifications
            on notifications.id = notification_deliveries.notification_id
          where notification_deliveries.actor_id = ?
            and notification_deliveries.read_at is null
          order by notifications.created_at desc, notifications.id desc
        `
      )
      .all(actorId) as NotificationRow[];

    return rows.map(notificationFromRow);
  }

  async markRead(input: {
    readonly notificationId: string;
    readonly actorId: string;
    readonly readAt: Date;
  }): Promise<void> {
    this.database
      .prepare(
        `
          update notification_deliveries
          set read_at = @readAt
          where notification_id = @notificationId
            and actor_id = @actorId
        `
      )
      .run({
        notificationId: input.notificationId,
        actorId: input.actorId,
        readAt: input.readAt.toISOString()
      });
  }
}

function notificationFromRow(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    scope: row.scope,
    title: row.title,
    body: row.body,
    ...(row.source_kind ? { sourceKind: row.source_kind } : {}),
    ...(row.source_id ? { sourceId: row.source_id } : {}),
    ...(row.created_by_actor_id
      ? { createdByActorId: row.created_by_actor_id }
      : {}),
    createdAt: new Date(row.created_at)
  };
}
