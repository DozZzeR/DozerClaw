import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/composition/build-app.js";
import { createSqliteDatabase } from "../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteFamilyMemoryRepository } from "../../src/infrastructure/providers/sqlite/sqlite-family-memory-repository.js";
import { SqliteServiceRegistryRepository } from "../../src/infrastructure/providers/sqlite/sqlite-service-registry-repository.js";
import type { ModelPort } from "../../src/ports/model-port.js";

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
      attachments: [],
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
        attachments: [],
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
        attachments: [],
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

  it("stores a model-classified family fact through composition", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        },
        modelProvider: {
          async runTextRequest() {
            return {
              text: JSON.stringify({
                kind: "record_fact",
                question: null,
                summary: "Max prefers chamomile tea before sleep.",
                query: null,
                reason: null
              })
            };
          }
        }
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      const reply = await app.handleNormalizedInboundMessage({
        messageId: "message-fact",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "remember Max prefers chamomile tea before sleep",
        attachments: [],
        receivedAt: new Date("2026-07-07T10:00:00.000Z"),
        now: new Date("2026-07-07T10:00:00.000Z")
      });
      expect(reply.text).toBe(
        "Saved family fact: Max prefers chamomile tea before sleep."
      );

      const database = createSqliteDatabase({ path: databasePath });
      const repository = new SqliteFamilyMemoryRepository(database);
      await expect(repository.listRecentActiveFamilyFacts(10)).resolves.toEqual([
        expect.objectContaining({
          category: "preference",
          body: "Max prefers chamomile tea before sleep.",
          sourceActorId: expect.any(String),
          sourceChatId: expect.any(String),
          sourceMessageText: "remember Max prefers chamomile tea before sleep",
          status: "active"
        })
      ]);
      database.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("lets owner approve a pending personal chat request", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        }
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      const pendingReply = await app.handleNormalizedInboundMessage({
        messageId: "message-pending-start",
        provider: "telegram",
        providerUserId: "tg-pending",
        providerChatId: "tg-pending",
        chatKind: "family_private",
        displayName: "Pending Person",
        text: "/start",
        attachments: [],
        receivedAt: new Date("2026-07-05T10:00:00.000Z"),
        now: new Date("2026-07-05T10:00:00.000Z")
      });
      expect(pendingReply.text).toBe(
        "Access request is pending owner approval."
      );

      const pendingListReply = await app.handleNormalizedInboundMessage({
        messageId: "message-owner-pending",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "/pending",
        attachments: [],
        receivedAt: new Date("2026-07-05T10:01:00.000Z"),
        now: new Date("2026-07-05T10:01:00.000Z")
      });
      expect(pendingListReply.text).toContain("Pending access requests:");
      expect(pendingListReply.text).toContain("Pending Person");
      const actorId = pendingListReply.text.match(/- ([^:]+):/)?.[1];
      expect(actorId).toBeTruthy();

      const approveReply = await app.handleNormalizedInboundMessage({
        messageId: "message-owner-approve",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: `/approve ${actorId}`,
        attachments: [],
        receivedAt: new Date("2026-07-05T10:02:00.000Z"),
        now: new Date("2026-07-05T10:02:00.000Z")
      });
      expect(approveReply.text).toBe(
        `Approved access request for ${actorId}.`
      );

      const familyReply = await app.handleNormalizedInboundMessage({
        messageId: "message-family",
        provider: "telegram",
        providerUserId: "tg-pending",
        providerChatId: "tg-pending",
        chatKind: "family_private",
        displayName: "Pending Person",
        text: "hello",
        attachments: [],
        receivedAt: new Date("2026-07-05T10:03:00.000Z"),
        now: new Date("2026-07-05T10:03:00.000Z")
      });
      expect(familyReply.text).toBe(
        "Command not implemented yet: family_message."
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses configured model provider for approved family fallback messages", async () => {
    const app = buildApp({
      env: {
        DOZERCLAW_DB_PATH: ":memory:",
        NODE_ENV: "test"
      },
      modelProvider: new FakeModelProvider(
        JSON.stringify({
          kind: "ask_clarification",
          question: "Who is this document for?"
        })
      )
    });
    await app.bootstrapOwnerIdentity({
      provider: "telegram",
      providerUserId: "tg-owner",
      providerChatId: "tg-owner",
      displayName: "Owner"
    });
    const pendingReply = await app.handleNormalizedInboundMessage({
      messageId: "message-pending-start",
      provider: "telegram",
      providerUserId: "tg-family",
      providerChatId: "tg-family",
      chatKind: "family_private",
      displayName: "Family",
      text: "/start",
      attachments: [],
      receivedAt: new Date("2026-07-05T11:00:00.000Z"),
      now: new Date("2026-07-05T11:00:00.000Z")
    });
    const actorId = (
      await app.handleNormalizedInboundMessage({
        messageId: "message-owner-pending",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "/pending",
        attachments: [],
        receivedAt: new Date("2026-07-05T11:01:00.000Z"),
        now: new Date("2026-07-05T11:01:00.000Z")
      })
    ).text.match(/- ([^:]+):/)?.[1];
    expect(pendingReply.text).toBe("Access request is pending owner approval.");
    expect(actorId).toBeTruthy();
    await app.handleNormalizedInboundMessage({
      messageId: "message-owner-approve",
      provider: "telegram",
      providerUserId: "tg-owner",
      providerChatId: "tg-owner",
      chatKind: "owner_private",
      displayName: "Owner",
      text: `/approve ${actorId}`,
      attachments: [],
      receivedAt: new Date("2026-07-05T11:02:00.000Z"),
      now: new Date("2026-07-05T11:02:00.000Z")
    });

    const reply = await app.handleNormalizedInboundMessage({
      messageId: "message-family",
      provider: "telegram",
      providerUserId: "tg-family",
      providerChatId: "tg-family",
      chatKind: "family_private",
      displayName: "Family",
      text: "I uploaded a document",
      attachments: [],
      receivedAt: new Date("2026-07-05T11:03:00.000Z"),
      now: new Date("2026-07-05T11:03:00.000Z")
    });

    expect(reply.text).toBe("Who is this document for?");
  });
});

class FakeModelProvider implements ModelPort {
  constructor(private readonly text: string) {}

  async runTextRequest() {
    return {
      text: this.text
    };
  }
}
