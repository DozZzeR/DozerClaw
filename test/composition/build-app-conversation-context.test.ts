import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildApp as buildRawApp } from "../../src/composition/build-app.js";
import type { CalendarEvent } from "../../src/core/domain/calendar/calendar-event.js";
import type {
  CalendarEventCreateInput,
  CalendarPort
} from "../../src/ports/calendar-port.js";
import type { ModelPort } from "../../src/ports/model-port.js";
import type {
  PlanningItem,
  PlanningPort,
  PlanningTaskCreate
} from "../../src/ports/planning-port.js";

const openApps: ReturnType<typeof buildRawApp>[] = [];

function buildApp(options?: Parameters<typeof buildRawApp>[0]) {
  const app = buildRawApp(options);
  openApps.push(app);
  return app;
}

function closeOpenApps(): void {
  while (openApps.length > 0) {
    openApps.pop()?.close?.();
  }
}

afterEach(closeOpenApps);

describe("buildApp short-term conversational context", () => {
  it("passes /digest and scheduled digest context to classifier so follow-up syncs Calendar event into Singularity without duplicating Calendar, and respects /clear & security exclusions", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-ctx-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const calendarEvents: CalendarEvent[] = [
      {
        id: "ev-webinar-1",
        title: "Бесплатный вебинар",
        startIso: "2026-11-26T16:00:00+01:00",
        endIso: "2026-11-26T18:00:00+01:00",
        allDay: false,
        meetingUrl: "https://meet.google.com/web-inar-123"
      }
    ];
    const createdCalendar: CalendarEventCreateInput[] = [];
    const createdPlanning: PlanningTaskCreate[] = [];
    const modelPrompts: string[] = [];

    const calendarProvider: CalendarPort = {
      async listEvents() {
        return calendarEvents;
      },
      async createEvent(input) {
        createdCalendar.push(input);
        return {
          id: `ev-${createdCalendar.length}`,
          title: input.title,
          startIso: input.startIso,
          endIso: input.endIso,
          allDay: false
        };
      }
    };
    const planningProvider: PlanningPort = {
      async queryPlanningState() {
        return {
          items: createdPlanning.map(
            (task, index): PlanningItem => ({
              id: `t-${index + 1}`,
              title: task.title,
              status: "scheduled",
              ...(task.startDateTime ? { start: task.startDateTime } : {}),
              ...(task.note ? { note: task.note } : {})
            })
          )
        };
      },
      async createPlanningTask(input) {
        createdPlanning.push(input);
        return {
          item: {
            id: `t-${createdPlanning.length}`,
            title: input.title,
            status: "scheduled",
            ...(input.startDateTime ? { start: input.startDateTime } : {}),
            ...(input.note ? { note: input.note } : {})
          }
        };
      }
    };
    const modelProvider: ModelPort = {
      async runTextRequest(request) {
        modelPrompts.push(request.input);
        const inputJsonMatch = /# Input\s*\n\n(\{[\s\S]*\})$/.exec(
          request.input
        );
        const parsedInput = inputJsonMatch?.[1]
          ? (JSON.parse(inputJsonMatch[1]) as {
              text?: string;
              recentTurns?: Array<{ role: string; text: string }>;
            })
          : {};
        const hasWebinarContext = (parsedInput.recentTurns ?? []).some((turn) =>
          turn.text.includes("Бесплатный вебинар")
        );

        if (
          parsedInput.text?.includes("сингулярити") &&
          hasWebinarContext
        ) {
          return {
            text: JSON.stringify({
              kind: "schedule_event",
              title: "Бесплатный вебинар",
              date: "2026-11-26",
              startTime: "16:00",
              durationMinutes: 120,
              externalIdOrUrl: null,
              summary: null,
              eventScope: "personal"
            })
          };
        }

        return {
          text: JSON.stringify({
            kind: "ask_clarification",
            question: "Уточните, что именно нужно сделать?"
          })
        };
      }
    };

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_TIME_ZONE: "Europe/Belgrade",
          DOZERCLAW_MODEL_ROUTING_ENABLED: "true",
          DOZERCLAW_ADMIN_SECRET: "super-secret-admin-pass",
          DOZERCLAW_MORNING_DIGEST_ENABLED: "true",
          DOZERCLAW_MORNING_DIGEST_TIME: "08:00",
          NODE_ENV: "test"
        },
        calendarProvider,
        planningProvider,
        modelProvider,
        notificationDelivery: {
          async send() {}
        }
      });

      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        displayName: "Alex"
      });

      // 1. /admin command must NEVER leak its secret into recentTurns.
      const adminReply = await app.handleNormalizedInboundMessage({
        messageId: "m-admin",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "/admin super-secret-admin-pass",
        attachments: [],
        receivedAt: new Date("2026-11-26T00:20:00.000Z"),
        now: new Date("2026-11-26T00:20:00.000Z")
      });
      expect(adminReply.text.toLowerCase()).toContain("admin");

      // 2. Owner calls /digest -> sees "Бесплатный вебинар" from Google Calendar.
      const digestReply = await app.handleNormalizedInboundMessage({
        messageId: "m-1",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "/digest",
        attachments: [],
        receivedAt: new Date("2026-11-26T00:25:00.000Z"),
        now: new Date("2026-11-26T00:25:00.000Z")
      });
      expect(digestReply.text).toContain("Бесплатный вебинар");

      // 3. Owner says "запиши эту же запись в сингулярити (синхронизируй)"
      const syncReply = await app.handleNormalizedInboundMessage({
        messageId: "m-2",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "запиши эту же запись в сингулярити (синхронизируй)",
        attachments: [],
        receivedAt: new Date("2026-11-26T00:26:00.000Z"),
        now: new Date("2026-11-26T00:26:00.000Z")
      });

      expect(syncReply.text).toContain("Google Calendar: уже есть");
      expect(syncReply.text).toContain("Singularity: добавлено");
      expect(createdCalendar).toHaveLength(0);
      expect(createdPlanning).toHaveLength(1);
      expect(createdPlanning[0]?.title).toBe("Бесплатный вебинар");
      expect(createdPlanning[0]?.startDateTime).toBe(
        "2026-11-26T16:00:00+01:00"
      );
      expect(createdPlanning[0]?.note).toBe(
        "https://meet.google.com/web-inar-123"
      );

      // Verify /admin secret was NOT recorded in prompt context
      expect(modelPrompts[0]).toContain("Бесплатный вебинар");
      expect(modelPrompts[0]).not.toContain("super-secret-admin-pass");

      // 4. /clear wipes recentTurns so the next message does NOT see prior turns
      const clearReply = await app.handleNormalizedInboundMessage({
        messageId: "m-3",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "/clear",
        attachments: [],
        receivedAt: new Date("2026-11-26T00:27:00.000Z"),
        now: new Date("2026-11-26T00:27:00.000Z")
      });
      expect(clearReply.text).toContain("очищен");

      const afterClearReply = await app.handleNormalizedInboundMessage({
        messageId: "m-4",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "запиши эту же запись в сингулярити",
        attachments: [],
        receivedAt: new Date("2026-11-26T00:28:00.000Z"),
        now: new Date("2026-11-26T00:28:00.000Z")
      });
      expect(afterClearReply.text).toContain("Уточните");
      expect(modelPrompts[1]).not.toContain("Бесплатный вебинар");

      // 5. Scheduled 08:00 digest records assistant turn so follow-up after automatic digest sees it
      const tick = await app.runMorningDigestTick?.(
        new Date("2026-11-26T07:00:00.000Z") // 08:00 CET
      );
      expect(tick?.status).toBe("sent");

      await app.handleNormalizedInboundMessage({
        messageId: "m-5",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "проверь запись о вебинаре",
        attachments: [],
        receivedAt: new Date("2026-11-26T07:05:00.000Z"),
        now: new Date("2026-11-26T07:05:00.000Z")
      });
      expect(modelPrompts[2]).toContain("Бесплатный вебинар");
    } finally {
      closeOpenApps();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("redacts sensitive tokens before storing conversation turns and never leaks owner turns to another chat", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-ctx-sec-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const modelPrompts: string[] = [];

    const modelProvider: ModelPort = {
      async runTextRequest(request) {
        modelPrompts.push(request.input);
        return {
          text: JSON.stringify({
            kind: "answer_from_memory",
            query: "test query"
          })
        };
      }
    };

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_TIME_ZONE: "Europe/Belgrade",
          DOZERCLAW_MODEL_ROUTING_ENABLED: "true",
          DOZERCLAW_ADMIN_SECRET: "admin-pass-42",
          NODE_ENV: "test"
        },
        modelProvider
      });

      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        displayName: "Alex"
      });

      // Owner sends message containing a secret Bearer token + query token
      await app.handleNormalizedInboundMessage({
        messageId: "s-1",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "Bearer sk-live-secret-999 https://owner-private-host.invalid?token=my-secret-param",
        attachments: [],
        receivedAt: new Date("2026-11-26T01:00:00.000Z"),
        now: new Date("2026-11-26T01:00:00.000Z")
      });

      await app.handleNormalizedInboundMessage({
        messageId: "s-2",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "что я прислал?",
        attachments: [],
        receivedAt: new Date("2026-11-26T01:01:00.000Z"),
        now: new Date("2026-11-26T01:01:00.000Z")
      });

      expect(modelPrompts[1]).not.toContain("sk-live-secret-999");
      expect(modelPrompts[1]).not.toContain("my-secret-param");
      expect(modelPrompts[1]).toContain("[redacted]");

      // Another approved chat (family_private) must never see owner_private recentTurns
      await app.handleNormalizedInboundMessage({
        messageId: "f-start",
        provider: "telegram",
        providerUserId: "2002",
        providerChatId: "2002",
        chatKind: "family_private",
        displayName: "Wife",
        text: "/start",
        attachments: [],
        receivedAt: new Date("2026-11-26T01:02:00.000Z"),
        now: new Date("2026-11-26T01:02:00.000Z")
      });
      const pendingText = (
        await app.handleNormalizedInboundMessage({
          messageId: "o-pending",
          provider: "telegram",
          providerUserId: "1001",
          providerChatId: "1001",
          chatKind: "owner_private",
          displayName: "Alex",
          text: "/pending",
          attachments: [],
          receivedAt: new Date("2026-11-26T01:02:10.000Z"),
          now: new Date("2026-11-26T01:02:10.000Z")
        })
      ).text;
      const wifeActorId = pendingText.match(/- ([^:]+):/)?.[1];
      expect(wifeActorId).toBeTruthy();
      await app.handleNormalizedInboundMessage({
        messageId: "o-admin",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "/admin admin-pass-42",
        attachments: [],
        receivedAt: new Date("2026-11-26T01:02:20.000Z"),
        now: new Date("2026-11-26T01:02:20.000Z")
      });
      await app.handleNormalizedInboundMessage({
        messageId: "o-approve",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: `/approve ${wifeActorId}`,
        attachments: [],
        receivedAt: new Date("2026-11-26T01:02:30.000Z"),
        now: new Date("2026-11-26T01:02:30.000Z")
      });

      await app.handleNormalizedInboundMessage({
        messageId: "s-3",
        provider: "telegram",
        providerUserId: "2002",
        providerChatId: "2002",
        chatKind: "family_private",
        displayName: "Wife",
        text: "что я прислала?",
        attachments: [],
        receivedAt: new Date("2026-11-26T01:03:00.000Z"),
        now: new Date("2026-11-26T01:03:00.000Z")
      });

      expect(modelPrompts[2]).toBeDefined();
      expect(modelPrompts[2]).not.toContain("[redacted]");
      expect(modelPrompts[2]).not.toContain("owner-private-host.invalid");
      expect(modelPrompts[2]).not.toContain("admin-pass-42");
    } finally {
      closeOpenApps();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
