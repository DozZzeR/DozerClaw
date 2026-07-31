import { describe, expect, it } from "vitest";

import {
  CreateNotificationUseCase,
  ListUnreadNotificationsUseCase,
  MarkNotificationReadUseCase
} from "../../../../src/application/use-cases/notifications/notification-use-cases.js";
import type { Actor } from "../../../../src/core/domain/identity/actor.js";
import type {
  NotificationRecord,
  NotificationRepositoryPort,
  StoredNotification
} from "../../../../src/ports/notification-repository-port.js";

describe("notification use cases", () => {
  it("fans out family notifications and keeps per-actor read state", async () => {
    const repository = new InMemoryNotificationRepository();
    const identity = new FakeIdentityRecipients([
      actor("actor-owner", "owner"),
      actor("actor-family-1", "family"),
      actor("actor-family-2", "family")
    ]);
    const create = new CreateNotificationUseCase({
      repository,
      identity,
      generateId: nextIds(["notification-1"]),
      now: () => new Date("2026-08-01T10:00:00.000Z")
    });
    const listUnread = new ListUnreadNotificationsUseCase({ repository });
    const markRead = new MarkNotificationReadUseCase({
      repository,
      now: () => new Date("2026-08-01T11:00:00.000Z")
    });

    await create.execute({
      scope: "family",
      title: "Family task created",
      body: "Pack bags",
      sourceKind: "planning_task",
      sourceId: "T-family",
      createdByActorId: "actor-owner"
    });

    await expect(listUnread.execute({ actorId: "actor-family-1" })).resolves
      .toMatchObject({
        notifications: [
          {
            id: "notification-1",
            scope: "family",
            title: "Family task created",
            body: "Pack bags"
          }
        ]
      });
    await expect(listUnread.execute({ actorId: "actor-family-2" })).resolves
      .toMatchObject({
        notifications: [
          {
            id: "notification-1"
          }
        ]
      });

    await markRead.execute({
      notificationId: "notification-1",
      actorId: "actor-family-1"
    });

    await expect(listUnread.execute({ actorId: "actor-family-1" })).resolves
      .toEqual({ notifications: [] });
    await expect(listUnread.execute({ actorId: "actor-family-2" })).resolves
      .toMatchObject({
        notifications: [
          {
            id: "notification-1"
          }
        ]
      });
  });

  it("delivers personal notifications only to the requested actor", async () => {
    const repository = new InMemoryNotificationRepository();
    const create = new CreateNotificationUseCase({
      repository,
      identity: new FakeIdentityRecipients([actor("actor-family-2", "family")]),
      generateId: nextIds(["notification-personal"]),
      now: () => new Date("2026-08-01T10:00:00.000Z")
    });
    const listUnread = new ListUnreadNotificationsUseCase({ repository });

    await create.execute({
      scope: "personal",
      recipientActorId: "actor-family-1",
      title: "Personal task created",
      body: "Book dentist"
    });

    await expect(listUnread.execute({ actorId: "actor-family-1" })).resolves
      .toMatchObject({
        notifications: [
          {
            id: "notification-personal",
            scope: "personal"
          }
        ]
      });
    await expect(listUnread.execute({ actorId: "actor-family-2" })).resolves
      .toEqual({ notifications: [] });
  });

  it("pushes created family notifications to delivery targets best-effort", async () => {
    const repository = new InMemoryNotificationRepository();
    const identity = new FakeIdentityRecipients([
      actor("actor-owner", "owner"),
      actor("actor-family", "family")
    ]);
    identity.deliveryTargets = [
      {
        actorId: "actor-owner",
        provider: "telegram",
        providerChatId: "tg-owner"
      },
      {
        actorId: "actor-family",
        provider: "telegram",
        providerChatId: "tg-family"
      }
    ];
    const delivery = new FakeNotificationDelivery(["tg-family"]);
    const create = new CreateNotificationUseCase({
      repository,
      identity,
      delivery,
      generateId: nextIds(["notification-1"]),
      now: () => new Date("2026-08-01T10:00:00.000Z")
    });

    await expect(
      create.execute({
        scope: "family",
        title: "Planning task created",
        body: "Pack bags"
      })
    ).resolves.toMatchObject({
      notification: {
        id: "notification-1"
      },
      recipientActorIds: ["actor-owner", "actor-family"]
    });
    expect(identity.requestedDeliveryActorIds).toEqual([
      ["actor-owner", "actor-family"]
    ]);
    expect(delivery.sent).toEqual([
      {
        provider: "telegram",
        providerChatId: "tg-owner",
        text: [
          "Planning task created",
          "Pack bags",
          "",
          "Notification id: notification-1",
          "Mark read: /read notification-1"
        ].join("\n")
      },
      {
        provider: "telegram",
        providerChatId: "tg-family",
        text: [
          "Planning task created",
          "Pack bags",
          "",
          "Notification id: notification-1",
          "Mark read: /read notification-1"
        ].join("\n")
      }
    ]);
  });
});

class InMemoryNotificationRepository implements NotificationRepositoryPort {
  private readonly notifications = new Map<string, NotificationRecord>();
  private readonly deliveries = new Map<string, Date | undefined>();

  async createNotification(input: {
    readonly notification: NotificationRecord;
    readonly recipientActorIds: readonly string[];
  }): Promise<StoredNotification> {
    this.notifications.set(input.notification.id, input.notification);

    for (const actorId of input.recipientActorIds) {
      this.deliveries.set(deliveryKey(input.notification.id, actorId), undefined);
    }

    return {
      ...input.notification,
      recipientActorIds: input.recipientActorIds
    };
  }

  async listUnreadForActor(actorId: string): Promise<readonly NotificationRecord[]> {
    return [...this.notifications.values()].filter((notification) =>
      this.deliveries.has(deliveryKey(notification.id, actorId)) &&
      this.deliveries.get(deliveryKey(notification.id, actorId)) === undefined
    );
  }

  async markRead(input: {
    readonly notificationId: string;
    readonly actorId: string;
    readonly readAt: Date;
  }): Promise<void> {
    const key = deliveryKey(input.notificationId, input.actorId);

    if (this.deliveries.has(key)) {
      this.deliveries.set(key, input.readAt);
    }
  }
}

class FakeIdentityRecipients {
  deliveryTargets: readonly {
    readonly actorId: string;
    readonly provider: string;
    readonly providerChatId: string;
  }[] = [];
  readonly requestedDeliveryActorIds: readonly string[][] = [];

  constructor(private readonly recipients: readonly Actor[]) {}

  async listActiveFamilyNotificationRecipients(): Promise<readonly Actor[]> {
    return this.recipients;
  }

  async listNotificationDeliveryTargetsForActors(
    actorIds: readonly string[]
  ) {
    (this.requestedDeliveryActorIds as string[][]).push([...actorIds]);

    return this.deliveryTargets.filter((target) =>
      actorIds.includes(target.actorId)
    );
  }
}

class FakeNotificationDelivery {
  readonly sent: {
    readonly provider: string;
    readonly providerChatId: string;
    readonly text: string;
  }[] = [];

  constructor(private readonly failingProviderChatIds: readonly string[] = []) {}

  async send(input: {
    readonly provider: string;
    readonly providerChatId: string;
    readonly text: string;
  }) {
    this.sent.push(input);

    if (this.failingProviderChatIds.includes(input.providerChatId)) {
      throw new Error("send failed");
    }
  }
}

function actor(id: string, role: Actor["role"]): Actor {
  return {
    id,
    displayName: id,
    role,
    status: "active"
  };
}

function deliveryKey(notificationId: string, actorId: string): string {
  return `${notificationId}:${actorId}`;
}

function nextIds(ids: readonly string[]): () => string {
  let index = 0;

  return () => ids[index++] ?? "notification-extra";
}
