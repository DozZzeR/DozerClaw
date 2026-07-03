import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
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

  it("persists local path service source config", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteServiceRegistryRepository(database);

    await repository.saveMonitoredService({
      id: "service-mempalace",
      name: "mempalace",
      healthSourceKind: "local_path",
      healthSourceConfig: {
        path: "/opt/services/mem-palace"
      },
      enabled: true,
      createdAt: new Date("2026-07-03T09:00:00.000Z"),
      updatedAt: new Date("2026-07-03T09:00:00.000Z")
    });

    await expect(repository.listEnabledMonitoredServices()).resolves.toEqual([
      {
        id: "service-mempalace",
        name: "mempalace",
        healthSourceKind: "local_path",
        healthSourceConfig: {
          path: "/opt/services/mem-palace"
        },
        enabled: true,
        createdAt: new Date("2026-07-03T09:00:00.000Z"),
        updatedAt: new Date("2026-07-03T09:00:00.000Z")
      }
    ]);

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

  it("migrates existing monitored service tables to local path source kind", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");

    try {
      const oldDatabase = new Database(databasePath);
      oldDatabase.exec(`
        create table monitored_services (
          id text primary key,
          name text not null unique,
          health_source_kind text not null check (health_source_kind in ('manual')),
          enabled integer not null check (enabled in (0, 1)),
          created_at text not null,
          updated_at text not null
        );
      `);
      oldDatabase.close();

      const database = createSqliteDatabase({ path: databasePath });
      const repository = new SqliteServiceRegistryRepository(database);

      await expect(
        repository.saveMonitoredService({
          id: "service-taskframe",
          name: "taskframe",
          healthSourceKind: "local_path",
          healthSourceConfig: {
            path: "/opt/services/taskframe"
          },
          enabled: true,
          createdAt: new Date("2026-07-03T09:00:00.000Z"),
          updatedAt: new Date("2026-07-03T09:00:00.000Z")
        })
      ).resolves.toBeUndefined();

      database.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
