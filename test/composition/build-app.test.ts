import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/composition/build-app.js";
import { createSqliteDatabase } from "../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteServiceRegistryRepository } from "../../src/infrastructure/providers/sqlite/sqlite-service-registry-repository.js";

describe("buildApp", () => {
  it("composes the application and exposes startup diagnostics", async () => {
    const app = buildApp({
      env: {
        DOZERCLAW_DB_PATH: ":memory:",
        NODE_ENV: "test"
      }
    });

    await expect(app.getStartupDiagnostics()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "composition",
          status: "ok"
        }),
        expect.objectContaining({
          name: "state_repository",
          status: "ok"
        }),
        expect.objectContaining({
          name: "event_log",
          status: "ok"
        })
      ])
    );
  });

  it("bootstraps owner and handles normalized health message", async () => {
    const app = buildApp({
      env: {
        DOZERCLAW_DB_PATH: ":memory:",
        NODE_ENV: "test"
      }
    });
    const bootstrap = await app.bootstrapOwnerIdentity({
      provider: "telegram",
      providerUserId: "tg-owner",
      providerChatId: "tg-owner-chat",
      displayName: "Owner"
    });

    const reply = await app.handleNormalizedInboundMessage({
      messageId: "message-1",
      provider: "telegram",
      providerUserId: "tg-owner",
      providerChatId: "tg-owner-chat",
      chatKind: "owner_private",
      displayName: "Owner",
      text: "health",
      receivedAt: new Date("2026-07-03T05:00:00.000Z"),
      now: new Date("2026-07-03T05:00:00.000Z")
    });

    expect(reply.chatId).toBe(bootstrap.chat.id);
    expect(reply.text).toContain("System health:");
    expect(reply.text).toContain("Uptime:");
    expect(reply.text).toContain("Memory:");
    expect(reply.text).toContain("Services:");
    expect(reply.text).toContain("- none configured");
  });

  it("includes registered services in normalized health message", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");

    try {
      const database = createSqliteDatabase({ path: databasePath });
      const serviceRegistry = new SqliteServiceRegistryRepository(database);
      await serviceRegistry.saveMonitoredService({
        id: "service-mempalace",
        name: "mempalace",
        healthSourceKind: "manual",
        enabled: true,
        createdAt: new Date("2026-07-03T10:00:00.000Z"),
        updatedAt: new Date("2026-07-03T10:00:00.000Z")
      });
      database.close();

      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        }
      });
      const bootstrap = await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        displayName: "Owner"
      });

      const reply = await app.handleNormalizedInboundMessage({
        messageId: "message-1",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "health",
        receivedAt: new Date("2026-07-03T10:00:00.000Z"),
        now: new Date("2026-07-03T10:00:00.000Z")
      });

      expect(reply.chatId).toBe(bootstrap.chat.id);
      expect(reply.text).toContain("Services:");
      expect(reply.text).toContain(
        "- mempalace: unknown (manual service has no automatic check)"
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("checks registered local path services in normalized health message", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const servicePath = join(directory, "service-dir");

    try {
      const database = createSqliteDatabase({ path: databasePath });
      const serviceRegistry = new SqliteServiceRegistryRepository(database);
      await serviceRegistry.saveMonitoredService({
        id: "service-local",
        name: "local-service",
        healthSourceKind: "local_path",
        healthSourceConfig: {
          path: servicePath
        },
        enabled: true,
        createdAt: new Date("2026-07-03T10:00:00.000Z"),
        updatedAt: new Date("2026-07-03T10:00:00.000Z")
      });
      database.close();

      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        }
      });
      const bootstrap = await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        displayName: "Owner"
      });

      const reply = await app.handleNormalizedInboundMessage({
        messageId: "message-1",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "health",
        receivedAt: new Date("2026-07-03T10:00:00.000Z"),
        now: new Date("2026-07-03T10:00:00.000Z")
      });

      expect(reply.chatId).toBe(bootstrap.chat.id);
      expect(reply.text).toContain(
        `- local-service: failed (path missing: ${servicePath})`
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
