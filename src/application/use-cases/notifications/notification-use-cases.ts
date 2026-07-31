import type { Actor } from "../../../core/domain/identity/actor.js";
import type {
  NotificationRecord,
  NotificationRepositoryPort
} from "../../../ports/notification-repository-port.js";
import type {
  NotificationDeliveryPort,
  NotificationDeliveryTarget
} from "../../../ports/notification-delivery-port.js";

export interface NotificationRecipientDirectory {
  listActiveFamilyNotificationRecipients(): Promise<readonly Actor[]>;
  listNotificationDeliveryTargetsForActors(
    actorIds: readonly string[]
  ): Promise<readonly NotificationDeliveryTarget[]>;
}

export type CreateNotificationInput =
  | {
      readonly scope: "family";
      readonly title: string;
      readonly body: string;
      readonly sourceKind?: string;
      readonly sourceId?: string;
      readonly createdByActorId?: string;
    }
  | {
      readonly scope: "personal";
      readonly recipientActorId: string;
      readonly title: string;
      readonly body: string;
      readonly sourceKind?: string;
      readonly sourceId?: string;
      readonly createdByActorId?: string;
    };

export interface CreateNotificationResult {
  readonly notification: NotificationRecord;
  readonly recipientActorIds: readonly string[];
}

export class CreateNotificationUseCase {
  constructor(
    private readonly dependencies: {
      readonly repository: NotificationRepositoryPort;
      readonly identity: NotificationRecipientDirectory;
      readonly delivery?: NotificationDeliveryPort;
      readonly generateId: () => string;
      readonly now: () => Date;
    }
  ) {}

  async execute(
    input: CreateNotificationInput
  ): Promise<CreateNotificationResult> {
    const recipientActorIds = await this.resolveRecipients(input);
    const notification: NotificationRecord = {
      id: this.dependencies.generateId(),
      scope: input.scope,
      title: input.title,
      body: input.body,
      ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      ...(input.createdByActorId
        ? { createdByActorId: input.createdByActorId }
        : {}),
      createdAt: this.dependencies.now()
    };

    const stored = await this.dependencies.repository.createNotification({
      notification,
      recipientActorIds
    });

    await this.pushNotification({
      notification: stored,
      recipientActorIds
    });

    return {
      notification: stored,
      recipientActorIds: stored.recipientActorIds
    };
  }

  private async resolveRecipients(
    input: CreateNotificationInput
  ): Promise<readonly string[]> {
    if (input.scope === "personal") {
      return [input.recipientActorId];
    }

    const recipients =
      await this.dependencies.identity.listActiveFamilyNotificationRecipients();

    return recipients.map((recipient) => recipient.id);
  }

  private async pushNotification(input: {
    readonly notification: NotificationRecord;
    readonly recipientActorIds: readonly string[];
  }): Promise<void> {
    if (!this.dependencies.delivery) {
      return;
    }

    const targets =
      await this.dependencies.identity.listNotificationDeliveryTargetsForActors(
        input.recipientActorIds
      );
    const text = formatNotificationPush(input.notification);

    await Promise.all(
      targets.map(async (target) => {
        try {
          await this.dependencies.delivery?.send({
            provider: target.provider,
            providerChatId: target.providerChatId,
            text
          });
        } catch {
          // Push delivery is best-effort; durable unread state is authoritative.
        }
      })
    );
  }
}

function formatNotificationPush(notification: NotificationRecord): string {
  return [
    notification.title,
    notification.body,
    "",
    `Notification id: ${notification.id}`,
    `Mark read: /read ${notification.id}`
  ].join("\n");
}

export interface ListUnreadNotificationsResult {
  readonly notifications: readonly NotificationRecord[];
}

export class ListUnreadNotificationsUseCase {
  constructor(
    private readonly dependencies: {
      readonly repository: NotificationRepositoryPort;
    }
  ) {}

  async execute(input: {
    readonly actorId: string;
  }): Promise<ListUnreadNotificationsResult> {
    return {
      notifications: await this.dependencies.repository.listUnreadForActor(
        input.actorId
      )
    };
  }
}

export class MarkNotificationReadUseCase {
  constructor(
    private readonly dependencies: {
      readonly repository: NotificationRepositoryPort;
      readonly now: () => Date;
    }
  ) {}

  async execute(input: {
    readonly notificationId: string;
    readonly actorId: string;
  }): Promise<void> {
    await this.dependencies.repository.markRead({
      notificationId: input.notificationId,
      actorId: input.actorId,
      readAt: this.dependencies.now()
    });
  }
}

export interface PlanningNotificationCreator {
  execute(input: CreateNotificationInput): Promise<CreateNotificationResult>;
}
