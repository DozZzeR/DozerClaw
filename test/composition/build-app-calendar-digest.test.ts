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

describe("buildApp calendar, Meet scheduling & morning digest", () => {
  it("handles bare Meet link -> pending clarification -> creates in Calendar + Singularity, and blocks non-owner access", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-cal-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const calendarEvents: CalendarEvent[] = [];
    const createdCalendar: CalendarEventCreateInput[] = [];
    const createdPlanning: PlanningTaskCreate[] = [];

    const calendarProvider: CalendarPort = {
      async listEvents() {
        return calendarEvents;
      },
      async createEvent(input) {
        createdCalendar.push(input);
        const ev: CalendarEvent = {
          id: `ev-${createdCalendar.length}`,
          title: input.title,
          startIso: input.startIso,
          endIso: input.endIso,
          allDay: false,
          ...(input.meetingUrl ? { meetingUrl: input.meetingUrl } : {})
        };
        calendarEvents.push(ev);
        return ev;
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
    const delivered: Array<{ providerChatId: string; text: string }> = [];

    try {
      const app = buildApp({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_TIME_ZONE: "Europe/Belgrade",
          DOZERCLAW_MORNING_DIGEST_ENABLED: "true",
          DOZERCLAW_MORNING_DIGEST_TIME: "08:00",
          NODE_ENV: "test"
        },
        calendarProvider,
        planningProvider,
        notificationDelivery: {
          async send(input) {
            delivered.push({
              providerChatId: input.providerChatId,
              text: input.text
            });
          }
        }
      });

      await app.bootstrapOwnerIdentity({
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        displayName: "Alex"
      });

      // Step 1: Owner drops bare Google Meet link (not in Calendar yet).
      const firstReply = await app.handleNormalizedInboundMessage({
        messageId: "m-1",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "https://meet.google.com/abc-defg-hij",
        attachments: [],
        receivedAt: new Date("2026-09-07T10:00:00.000Z"),
        now: new Date("2026-09-07T10:00:00.000Z")
      });

      expect(firstReply.text).toContain("В Google Calendar этой встречи пока нет.");

      // Step 2: Owner replies with date/time/title (even without LLM model!).
      const secondReply = await app.handleNormalizedInboundMessage({
        messageId: "m-2",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "2026-09-08 в 15:00, Созвон по релизу",
        attachments: [],
        receivedAt: new Date("2026-09-07T10:02:00.000Z"),
        now: new Date("2026-09-07T10:02:00.000Z")
      });

      expect(secondReply.text).toContain("Google Calendar: добавлено");
      expect(secondReply.text).toContain("Singularity: добавлено");
      expect(createdCalendar).toHaveLength(1);
      expect(createdCalendar[0]?.startIso).toBe("2026-09-08T15:00:00+02:00");
      expect(createdPlanning).toHaveLength(1);
      expect(createdPlanning[0]?.note).toBe(
        "https://meet.google.com/abc-defg-hij"
      );

      // Step 3: Manual /digest command in owner_private returns the synced event + Meet link.
      const digestReply = await app.handleNormalizedInboundMessage({
        messageId: "m-3",
        provider: "telegram",
        providerUserId: "1001",
        providerChatId: "1001",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "/digest",
        attachments: [],
        receivedAt: new Date("2026-09-08T06:00:00.000Z"),
        now: new Date("2026-09-08T06:00:00.000Z")
      });

      expect(digestReply.text).toContain("Созвон по релизу");
      expect(digestReply.text).toContain("https://meet.google.com/abc-defg-hij");

      // Step 4: Scheduled 08:00 morning digest tick sends once and skips duplicate tick.
      const tick1 = await app.runMorningDigestTick?.(
        new Date("2026-09-08T06:00:00.000Z")
      );
      const tick2 = await app.runMorningDigestTick?.(
        new Date("2026-09-08T06:05:00.000Z")
      );

      expect(tick1?.status).toBe("sent");
      expect(tick2?.status).toBe("already_handled");
      expect(delivered).toHaveLength(1);
      expect(delivered[0]?.providerChatId).toBe("1001");
      expect(delivered[0]?.text).toContain("Созвон по релизу");

      // Step 5: Non-owner family user is denied /digest.
      const deniedReply = await app.handleNormalizedInboundMessage({
        messageId: "m-4",
        provider: "telegram",
        providerUserId: "2002",
        providerChatId: "2002",
        chatKind: "family_private",
        displayName: "Guest",
        text: "/digest",
        attachments: [],
        receivedAt: new Date("2026-09-08T06:10:00.000Z"),
        now: new Date("2026-09-08T06:10:00.000Z")
      });
      expect(deniedReply.text).not.toContain("Созвон по релизу");
    } finally {
      closeOpenApps();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
