import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/composition/build-app.js";
import { createSqliteDatabase } from "../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteDocumentRepository } from "../../src/infrastructure/providers/sqlite/sqlite-document-repository.js";
import { SqliteFamilyMemoryRepository } from "../../src/infrastructure/providers/sqlite/sqlite-family-memory-repository.js";
import { SqliteServiceRegistryRepository } from "../../src/infrastructure/providers/sqlite/sqlite-service-registry-repository.js";
import type {
  DocumentStoragePort,
  ResolveDocumentInput
} from "../../src/ports/document-storage-port.js";
import type {
  ModelPort,
  ModelTextRequest
} from "../../src/ports/model-port.js";

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

  it("recalls a stored family fact through composition", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const modelProvider = new QueueModelProvider([
      JSON.stringify({
        kind: "record_fact",
        question: null,
        summary: "Max prefers chamomile tea before sleep.",
        query: null,
        reason: null
      }),
      JSON.stringify({
        kind: "answer_from_memory",
        question: null,
        summary: null,
        query: "what do you remember about Max?",
        reason: null
      }),
      selectFirstMemoryItem,
      synthesizeFromFirstMemoryItem
    ]);

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        },
        modelProvider
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      await app.handleNormalizedInboundMessage({
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

      const reply = await app.handleNormalizedInboundMessage({
        messageId: "message-recall",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "what do you remember about Max?",
        attachments: [],
        receivedAt: new Date("2026-07-07T10:01:00.000Z"),
        now: new Date("2026-07-07T10:01:00.000Z")
      });

      expect(reply.text).toBe("Max prefers chamomile tea before sleep.");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("archives a stored family fact through composition", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const modelProvider = new QueueModelProvider([
      JSON.stringify({
        kind: "record_fact",
        question: null,
        summary: "Max prefers chamomile tea before sleep.",
        query: null,
        reason: null
      }),
      JSON.stringify({
        kind: "archive_fact",
        question: null,
        summary: null,
        query: "Max chamomile tea",
        reason: null
      }),
      JSON.stringify({
        kind: "answer_from_memory",
        question: null,
        summary: null,
        query: "what helps Max sleep?",
        reason: null
      })
    ]);

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        },
        modelProvider
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      await app.handleNormalizedInboundMessage({
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

      const archiveReply = await app.handleNormalizedInboundMessage({
        messageId: "message-archive",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "forget Max chamomile tea",
        attachments: [],
        receivedAt: new Date("2026-07-07T10:01:00.000Z"),
        now: new Date("2026-07-07T10:01:00.000Z")
      });

      expect(archiveReply.text).toBe(
        "Archived family fact: Max prefers chamomile tea before sleep."
      );

      const database = createSqliteDatabase({ path: databasePath });
      const repository = new SqliteFamilyMemoryRepository(database);
      await expect(repository.listRecentActiveFamilyFacts(10)).resolves.toEqual(
        []
      );
      database.close();

      const recallReply = await app.handleNormalizedInboundMessage({
        messageId: "message-recall",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "what helps Max sleep?",
        attachments: [],
        receivedAt: new Date("2026-07-07T10:02:00.000Z"),
        now: new Date("2026-07-07T10:02:00.000Z")
      });

      expect(recallReply.text).toBe("I do not have any saved family facts yet.");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("resolves an ambiguous archive request through pending selection", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const modelProvider = new QueueModelProvider([
      JSON.stringify({
        kind: "archive_fact",
        question: null,
        summary: null,
        query: "Max tea",
        reason: null
      })
    ]);

    try {
      const database = createSqliteDatabase({ path: databasePath });
      const repository = new SqliteFamilyMemoryRepository(database);
      await repository.saveFamilyFact({
        id: "fact-first",
        category: "preference",
        body: "Max prefers chamomile tea.",
        subjectId: "max",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-owner",
        sourceMessageText: "remember Max prefers chamomile tea",
        status: "active",
        createdAt: new Date("2026-07-07T10:00:00.000Z"),
        updatedAt: new Date("2026-07-07T10:00:00.000Z")
      });
      await repository.saveFamilyFact({
        id: "fact-second",
        category: "preference",
        body: "Max likes peppermint tea.",
        subjectId: "max",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-owner",
        sourceMessageText: "remember Max likes peppermint tea",
        status: "active",
        createdAt: new Date("2026-07-07T10:01:00.000Z"),
        updatedAt: new Date("2026-07-07T10:01:00.000Z")
      });
      database.close();

      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        },
        modelProvider
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      const ambiguousReply = await app.handleNormalizedInboundMessage({
        messageId: "message-archive",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "forget Max tea",
        attachments: [],
        receivedAt: new Date("2026-07-07T10:02:00.000Z"),
        now: new Date("2026-07-07T10:02:00.000Z")
      });

      expect(ambiguousReply.text).toBe(
        [
          "I found multiple active family facts that could match.",
          "1. Max likes peppermint tea.",
          "2. Max prefers chamomile tea.",
          "Reply with the number to archive, or cancel."
        ].join("\n")
      );

      const selectedReply = await app.handleNormalizedInboundMessage({
        messageId: "message-archive-selection",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "1",
        attachments: [],
        receivedAt: new Date("2026-07-07T10:03:00.000Z"),
        now: new Date("2026-07-07T10:03:00.000Z")
      });

      expect(selectedReply.text).toBe(
        "Archived family fact: Max likes peppermint tea."
      );

      const verifyDatabase = createSqliteDatabase({ path: databasePath });
      const verifyRepository = new SqliteFamilyMemoryRepository(verifyDatabase);
      await expect(verifyRepository.listRecentActiveFamilyFacts(10)).resolves.toEqual([
        expect.objectContaining({
          id: "fact-first",
          body: "Max prefers chamomile tea.",
          status: "active"
        })
      ]);
      verifyDatabase.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("registers an external document through composition", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const documentStorage = new FakeDocumentStorage();

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        },
        modelProvider: new QueueModelProvider([
          JSON.stringify({
            kind: "register_document",
            question: null,
            summary: null,
            externalIdOrUrl: "https://drive.google.com/file/d/abc",
            documentType: "identity",
            subjectId: "max",
            query: null,
            reason: null
          })
        ]),
        documentStorage
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      const reply = await app.handleNormalizedInboundMessage({
        messageId: "message-document",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "register this document https://drive.google.com/file/d/abc",
        attachments: [],
        receivedAt: new Date("2026-07-14T08:00:00.000Z"),
        now: new Date("2026-07-14T08:00:00.000Z")
      });

      expect(reply.text).toBe(
        "Registered document: Passport.pdf (identity, subject: max)"
      );
      expect(documentStorage.seenInput).toEqual({
        externalIdOrUrl: "https://drive.google.com/file/d/abc"
      });

      const database = createSqliteDatabase({ path: databasePath });
      const repository = new SqliteDocumentRepository(database);
      await expect(
        repository.findDocumentByExternalId("google_drive", "drive-abc")
      ).resolves.toEqual(
        expect.objectContaining({
          provider: "google_drive",
          externalId: "drive-abc",
          name: "Passport.pdf",
          url: "https://drive.google.com/file/d/abc",
          documentType: "identity",
          subjectId: "max",
          status: "registered"
        })
      );
      database.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("registers an external document through configured Google Drive storage", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const drive = await startGoogleDriveStub();

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_GOOGLE_DRIVE_ACCESS_TOKEN: "drive-token",
          DOZERCLAW_GOOGLE_DRIVE_API_BASE_URL: drive.url,
          NODE_ENV: "test"
        },
        modelProvider: new QueueModelProvider([
          JSON.stringify({
            kind: "register_document",
            question: null,
            summary: null,
            externalIdOrUrl: "https://drive.google.com/file/d/drive-abc/view",
            query: null,
            reason: null
          })
        ])
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      const reply = await app.handleNormalizedInboundMessage({
        messageId: "message-document",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "register https://drive.google.com/file/d/drive-abc/view",
        attachments: [],
        receivedAt: new Date("2026-07-14T08:00:00.000Z"),
        now: new Date("2026-07-14T08:00:00.000Z")
      });

      expect(reply.text).toBe("Registered document: Passport.pdf");
      expect(drive.requests).toEqual([
        {
          path: "/drive/v3/files/drive-abc?fields=id%2Cname%2CwebViewLink",
          authorization: "Bearer drive-token"
        }
      ]);
    } finally {
      await drive.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("finds a locally registered document through composition", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const modelProvider = new QueueModelProvider([
      JSON.stringify({
        kind: "find_document",
        question: null,
        summary: null,
        externalIdOrUrl: null,
        documentType: "identity",
        subjectId: "max",
        query: "passport",
        reason: null
      })
    ]);

    try {
      const database = createSqliteDatabase({ path: databasePath });
      const repository = new SqliteDocumentRepository(database);
      await repository.saveDocument({
        id: "document-passport",
        provider: "google_drive",
        externalId: "drive-passport",
        name: "Max Passport.pdf",
        url: "https://drive.google.com/file/d/passport",
        documentType: "identity",
        subjectId: "max",
        status: "registered",
        createdAt: new Date("2026-07-14T08:00:00.000Z"),
        updatedAt: new Date("2026-07-14T08:00:00.000Z")
      });
      database.close();

      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        },
        modelProvider
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      const reply = await app.handleNormalizedInboundMessage({
        messageId: "message-document-lookup",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "show Max passport",
        attachments: [],
        receivedAt: new Date("2026-07-14T08:30:00.000Z"),
        now: new Date("2026-07-14T08:30:00.000Z")
      });

      expect(reply.text).toBe(
        [
          "Registered documents:",
          "- Max Passport.pdf (identity, subject: max)",
          "  https://drive.google.com/file/d/passport"
        ].join("\n")
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("updates and archives a local document through composition", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const modelProvider = new QueueModelProvider([
      JSON.stringify({
        kind: "update_document",
        question: null,
        summary: null,
        externalIdOrUrl: null,
        documentType: "identity",
        subjectId: "max",
        query: "passport",
        reason: null
      }),
      JSON.stringify({
        kind: "archive_document",
        question: null,
        summary: null,
        externalIdOrUrl: null,
        documentType: null,
        subjectId: null,
        query: "passport",
        reason: null
      })
    ]);

    try {
      const database = createSqliteDatabase({ path: databasePath });
      const repository = new SqliteDocumentRepository(database);
      await repository.saveDocument({
        id: "document-passport",
        provider: "google_drive",
        externalId: "drive-passport",
        name: "Max Passport.pdf",
        url: "https://drive.google.com/file/d/passport",
        documentType: "other",
        subjectId: "family",
        status: "registered",
        createdAt: new Date("2026-07-14T08:00:00.000Z"),
        updatedAt: new Date("2026-07-14T08:00:00.000Z")
      });
      database.close();

      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        },
        modelProvider
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      const updateReply = await app.handleNormalizedInboundMessage({
        messageId: "message-document-update",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "set Max passport as identity",
        attachments: [],
        receivedAt: new Date("2026-07-14T08:30:00.000Z"),
        now: new Date("2026-07-14T08:30:00.000Z")
      });

      expect(updateReply.text).toBe(
        "Updated document: Max Passport.pdf (identity, subject: max)"
      );

      const archiveReply = await app.handleNormalizedInboundMessage({
        messageId: "message-document-archive",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "archive Max passport",
        attachments: [],
        receivedAt: new Date("2026-07-14T08:31:00.000Z"),
        now: new Date("2026-07-14T08:31:00.000Z")
      });

      expect(archiveReply.text).toBe("Archived document: Max Passport.pdf");

      const verifyDatabase = createSqliteDatabase({ path: databasePath });
      const verifyRepository = new SqliteDocumentRepository(verifyDatabase);
      await expect(
        verifyRepository.searchDocuments({
          query: "passport",
          limit: 10
        })
      ).resolves.toEqual([]);
      verifyDatabase.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("resolves an ambiguous document archive through pending selection", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const modelProvider = new QueueModelProvider([
      JSON.stringify({
        kind: "archive_document",
        question: null,
        summary: null,
        externalIdOrUrl: null,
        documentType: null,
        subjectId: null,
        query: "passport",
        reason: null
      })
    ]);

    try {
      const database = createSqliteDatabase({ path: databasePath });
      const repository = new SqliteDocumentRepository(database);
      await repository.saveDocument({
        id: "document-max",
        provider: "google_drive",
        externalId: "drive-max",
        name: "Max Passport.pdf",
        url: "https://drive.google.com/file/d/max",
        documentType: "identity",
        subjectId: "max",
        status: "registered",
        createdAt: new Date("2026-07-14T08:00:00.000Z"),
        updatedAt: new Date("2026-07-14T08:00:00.000Z")
      });
      await repository.saveDocument({
        id: "document-sofia",
        provider: "google_drive",
        externalId: "drive-sofia",
        name: "Sofia Passport.pdf",
        url: "https://drive.google.com/file/d/sofia",
        documentType: "identity",
        subjectId: "sofia",
        status: "registered",
        createdAt: new Date("2026-07-14T08:01:00.000Z"),
        updatedAt: new Date("2026-07-14T08:01:00.000Z")
      });
      database.close();

      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        },
        modelProvider
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      const ambiguousReply = await app.handleNormalizedInboundMessage({
        messageId: "message-document-archive",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "archive passport",
        attachments: [],
        receivedAt: new Date("2026-07-14T08:30:00.000Z"),
        now: new Date("2026-07-14T08:30:00.000Z")
      });

      expect(ambiguousReply.text).toBe(
        [
          "I found multiple registered documents that could match.",
          "1. Sofia Passport.pdf",
          "2. Max Passport.pdf",
          "Reply with the number to choose, or cancel."
        ].join("\n")
      );

      const selectedReply = await app.handleNormalizedInboundMessage({
        messageId: "message-document-selection",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "2",
        attachments: [],
        receivedAt: new Date("2026-07-14T08:31:00.000Z"),
        now: new Date("2026-07-14T08:31:00.000Z")
      });

      expect(selectedReply.text).toBe("Archived document: Max Passport.pdf");

      const verifyDatabase = createSqliteDatabase({ path: databasePath });
      const verifyRepository = new SqliteDocumentRepository(verifyDatabase);
      await expect(
        verifyRepository.searchDocuments({
          query: "passport",
          limit: 10
        })
      ).resolves.toEqual([
        expect.objectContaining({
          id: "document-sofia",
          status: "registered"
        })
      ]);
      verifyDatabase.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses chat-managed subject aliases during recall", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const modelProvider = new QueueModelProvider([
      JSON.stringify({
        kind: "save_subject_alias",
        question: null,
        summary: null,
        category: null,
        subjectId: null,
        aliasSubjectId: "Maksim",
        canonicalSubjectId: "Max",
        query: null,
        reason: null
      }),
      JSON.stringify({
        kind: "record_fact",
        question: null,
        summary: "Max prefers chamomile tea before sleep.",
        category: "preference",
        subjectId: "max",
        aliasSubjectId: null,
        canonicalSubjectId: null,
        query: null,
        reason: null
      }),
      JSON.stringify({
        kind: "answer_from_memory",
        question: null,
        summary: null,
        category: null,
        subjectId: null,
        aliasSubjectId: null,
        canonicalSubjectId: null,
        query: "what helps Maksim sleep?",
        reason: null
      }),
      selectFirstMemoryItem,
      synthesizeFromFirstMemoryItem
    ]);

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test"
        },
        modelProvider
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      await expect(
        app.handleNormalizedInboundMessage({
          messageId: "message-alias",
          provider: "telegram",
          providerUserId: "tg-owner",
          providerChatId: "tg-owner",
          chatKind: "owner_private",
          displayName: "Owner",
          text: "Maksim is Max",
          attachments: [],
          receivedAt: new Date("2026-07-07T10:00:00.000Z"),
          now: new Date("2026-07-07T10:00:00.000Z")
        })
      ).resolves.toMatchObject({
        text: "Saved subject alias: maksim -> max"
      });

      await app.handleNormalizedInboundMessage({
        messageId: "message-fact",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "remember Max prefers chamomile tea before sleep",
        attachments: [],
        receivedAt: new Date("2026-07-07T10:01:00.000Z"),
        now: new Date("2026-07-07T10:01:00.000Z")
      });

      const reply = await app.handleNormalizedInboundMessage({
        messageId: "message-recall",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "what helps Maksim sleep?",
        attachments: [],
        receivedAt: new Date("2026-07-07T10:02:00.000Z"),
        now: new Date("2026-07-07T10:02:00.000Z")
      });

      expect(reply.text).toBe("Max prefers chamomile tea before sleep.");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses configured MemPalace memory provider for family fact storage and recall", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const mempalace = await startMempalaceStub([
      {
        success: true,
        drawer_id: "drawer-fact-1"
      },
      {
        results: [
          {
            drawer_id: "drawer-fact-1",
            content: "Family fact: Max prefers chamomile tea before sleep.",
            distance: 0.2
          }
        ]
      }
    ]);
    const modelProvider = new QueueModelProvider([
      JSON.stringify({
        kind: "record_fact",
        question: null,
        summary: "Max prefers chamomile tea before sleep.",
        query: null,
        reason: null
      }),
      JSON.stringify({
        kind: "answer_from_memory",
        question: null,
        summary: null,
        query: "what helps Max sleep?",
        reason: null
      }),
      selectFirstMemoryItem,
      synthesizeFromFirstMemoryItem
    ]);

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_MEMPALACE_MCP_URL: mempalace.url,
          DOZERCLAW_MEMPALACE_BEARER_TOKEN: "secret",
          NODE_ENV: "test"
        },
        modelProvider
      });
      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        displayName: "Owner"
      });

      await app.handleNormalizedInboundMessage({
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

      const reply = await app.handleNormalizedInboundMessage({
        messageId: "message-recall",
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner",
        chatKind: "owner_private",
        displayName: "Owner",
        text: "what helps Max sleep?",
        attachments: [],
        receivedAt: new Date("2026-07-07T10:01:00.000Z"),
        now: new Date("2026-07-07T10:01:00.000Z")
      });

      expect(reply.text).toBe("Max prefers chamomile tea before sleep.");
      expect(mempalace.requests.map((request) => request.params.name)).toEqual([
        "mempalace_add_drawer",
        "mempalace_search"
      ]);
      expect(mempalace.requests[0]?.params.arguments).toEqual(
        expect.objectContaining({
          wing: "family",
          room: "facts",
          content: expect.stringContaining("Family fact: Max prefers chamomile")
        })
      );
      expect(mempalace.requests[1]?.params.arguments).toEqual(
        expect.objectContaining({
          query: "what helps Max sleep?",
          limit: 5,
          wing: "family",
          room: "facts"
        })
      );
      expect(mempalace.authorizationHeaders).toEqual([
        "Bearer secret",
        "Bearer secret"
      ]);
    } finally {
      await mempalace.close();
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

type QueuedModelResponse = string | ((request: ModelTextRequest) => string);

class QueueModelProvider implements ModelPort {
  constructor(private readonly texts: QueuedModelResponse[]) {}

  async runTextRequest(request: ModelTextRequest) {
    const queued = this.texts.shift();

    if (!queued) {
      throw new Error("no queued model response");
    }

    return {
      text: typeof queued === "function" ? queued(request) : queued
    };
  }
}

class FakeDocumentStorage implements DocumentStoragePort {
  seenInput: ResolveDocumentInput | undefined;

  async resolveDocument(input: ResolveDocumentInput) {
    this.seenInput = input;

    return {
      externalId: "drive-abc",
      name: "Passport.pdf",
      url: "https://drive.google.com/file/d/abc"
    };
  }
}

function selectFirstMemoryItem(request: ModelTextRequest): string {
  return JSON.stringify({
    memoryItemIds: [firstCandidateId(request.input)]
  });
}

function synthesizeFromFirstMemoryItem(request: ModelTextRequest): string {
  return JSON.stringify({
    answer: "Max prefers chamomile tea before sleep.",
    usedMemoryItemIds: [firstCandidateId(request.input)]
  });
}

function firstCandidateId(input: string): string {
  const match = input.match(/\[\{[\s\S]*\}\]/);

  if (!match) {
    throw new Error("missing memory candidate JSON");
  }

  const candidates = JSON.parse(match[0]) as Array<{ readonly id: string }>;
  const id = candidates[0]?.id;

  if (!id) {
    throw new Error("missing first memory candidate id");
  }

  return id;
}

interface MempalaceStubRequest {
  readonly params: {
    readonly name: string;
    readonly arguments: Record<string, unknown>;
  };
}

async function startMempalaceStub(responses: readonly unknown[]) {
  const requests: MempalaceStubRequest[] = [];
  const authorizationHeaders: string[] = [];
  let responseIndex = 0;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      authorizationHeaders.push(request.headers.authorization ?? "");
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        readonly id: number;
        readonly params: MempalaceStubRequest["params"];
      };
      requests.push({ params: body.params });
      const payload = responses[responseIndex++] ?? {};

      response.writeHead(200, {
        "Content-Type": "application/json"
      });
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(payload)
              }
            ]
          }
        })
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    requests,
    authorizationHeaders,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

async function startGoogleDriveStub() {
  const requests: Array<{ readonly path: string; readonly authorization: string }> =
    [];
  const server = createServer((request, response) => {
    requests.push({
      path: request.url ?? "",
      authorization: String(request.headers.authorization ?? "")
    });
    response.writeHead(200, {
      "Content-Type": "application/json"
    });
    response.end(
      JSON.stringify({
        id: "drive-abc",
        name: "Passport.pdf",
        webViewLink: "https://drive.google.com/file/d/drive-abc/view"
      })
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}
