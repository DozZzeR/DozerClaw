import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteServiceRegistryRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-service-registry-repository.js";

describe("SqliteServiceRegistryRepository", () => {
  it("persists and lists enabled monitored services sorted by name", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteServiceRegistryRepository(database);

    await repository.saveMonitoredService({
      id: "service-z",
      name: "zeta",
      healthSourceKind: "manual",
      enabled: true,
      createdAt: new Date("2026-07-03T09:00:00.000Z"),
      updatedAt: new Date("2026-07-03T09:00:01.000Z")
    });
    await repository.saveMonitoredService({
      id: "service-a",
      name: "alpha",
      healthSourceKind: "manual",
      enabled: true,
      createdAt: new Date("2026-07-03T09:00:02.000Z"),
      updatedAt: new Date("2026-07-03T09:00:03.000Z")
    });

    await expect(repository.listEnabledMonitoredServices()).resolves.toEqual([
      {
        id: "service-a",
        name: "alpha",
        healthSourceKind: "manual",
        enabled: true,
        createdAt: new Date("2026-07-03T09:00:02.000Z"),
        updatedAt: new Date("2026-07-03T09:00:03.000Z")
      },
      {
        id: "service-z",
        name: "zeta",
        healthSourceKind: "manual",
        enabled: true,
        createdAt: new Date("2026-07-03T09:00:00.000Z"),
        updatedAt: new Date("2026-07-03T09:00:01.000Z")
      }
    ]);

    database.close();
  });

  it("excludes disabled monitored services", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteServiceRegistryRepository(database);

    await repository.saveMonitoredService({
      id: "service-disabled",
      name: "disabled",
      healthSourceKind: "manual",
      enabled: false,
      createdAt: new Date("2026-07-03T09:00:00.000Z"),
      updatedAt: new Date("2026-07-03T09:00:00.000Z")
    });

    await expect(repository.listEnabledMonitoredServices()).resolves.toEqual([]);

    database.close();
  });

  it("rejects duplicate service names", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteServiceRegistryRepository(database);
    const service = {
      id: "service-1",
      name: "planner",
      healthSourceKind: "manual" as const,
      enabled: true,
      createdAt: new Date("2026-07-03T09:00:00.000Z"),
      updatedAt: new Date("2026-07-03T09:00:00.000Z")
    };

    await repository.saveMonitoredService(service);

    await expect(
      repository.saveMonitoredService({
        ...service,
        id: "service-2"
      })
    ).rejects.toThrow();

    database.close();
  });
});
