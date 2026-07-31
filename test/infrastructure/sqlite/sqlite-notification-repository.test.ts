import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteNotificationRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-notification-repository.js";

describe("SqliteNotificationRepository", () => {
  it("persists notification deliveries and read state per actor", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteNotificationRepository(database);
    database.exec(`
      insert into actors (id, display_name, role, status)
      values
        ('actor-owner', 'Owner', 'owner', 'active'),
        ('actor-family-1', 'Family 1', 'family', 'active'),
        ('actor-family-2', 'Family 2', 'family', 'active');
    `);

    await repository.createNotification({
      notification: {
        id: "notification-1",
        scope: "family",
        title: "Family task created",
        body: "Pack bags",
        sourceKind: "planning_task",
        sourceId: "T-family",
        createdByActorId: "actor-owner",
        createdAt: new Date("2026-08-01T10:00:00.000Z")
      },
      recipientActorIds: ["actor-owner", "actor-family-1", "actor-family-2"]
    });

    await expect(repository.listUnreadForActor("actor-family-1")).resolves
      .toMatchObject([
        {
          id: "notification-1",
          scope: "family",
          title: "Family task created",
          body: "Pack bags"
        }
      ]);

    await repository.markRead({
      notificationId: "notification-1",
      actorId: "actor-family-1",
      readAt: new Date("2026-08-01T11:00:00.000Z")
    });

    await expect(repository.listUnreadForActor("actor-family-1")).resolves
      .toEqual([]);
    await expect(repository.listUnreadForActor("actor-family-2")).resolves
      .toMatchObject([
        {
          id: "notification-1"
        }
      ]);

    database.close();
  });
});
