import { describe, expect, it } from "vitest";

import { MorningDigestScheduler } from "../../../../src/application/use-cases/calendar/morning-digest-scheduler.js";
import { SendMorningDigestUseCase } from "../../../../src/application/use-cases/calendar/send-morning-digest.js";
import { createSqliteDatabase } from "../../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteDigestRunRepository } from "../../../../src/infrastructure/providers/sqlite/sqlite-digest-run-repository.js";
import type { CalendarPort } from "../../../../src/ports/calendar-port.js";
import type { PlanningPort } from "../../../../src/ports/planning-port.js";

describe("SendMorningDigestUseCase & MorningDigestScheduler", () => {
  it("builds a combined Calendar + Singularity digest, preserving distinct same-title tasks and deduping mirrored Meet links", async () => {
    const calendar: CalendarPort = {
      async listEvents() {
        return [
          {
            id: "ev-1",
            title: "Daily sync",
            startIso: "2026-09-08T10:00:00+02:00",
            endIso: "2026-09-08T10:30:00+02:00",
            allDay: false,
            meetingUrl: "https://meet.google.com/abc-defg-hij"
          }
        ];
      },
      async createEvent() {
        throw new Error("unused");
      }
    };
    const queries: Array<{
      readonly scope: string;
      readonly startDateTimeFrom?: string;
      readonly startDateTimeTo?: string;
    }> = [];
    const planning: PlanningPort = {
      async queryPlanningState(query) {
        queries.push({
          scope: query.scope,
          ...(query.startDateTimeFrom
            ? { startDateTimeFrom: query.startDateTimeFrom }
            : {}),
          ...(query.startDateTimeTo
            ? { startDateTimeTo: query.startDateTimeTo }
            : {})
        });
        if (query.scope === "personal") {
          return {
            items: [
              {
                id: "t-mirror",
                title: "Daily sync",
                status: "scheduled",
                start: "2026-09-08T10:00:00+02:00",
                useTime: true,
                note: "https://meet.google.com/abc-defg-hij"
              },
              {
                id: "t-1",
                title: "Call clinic",
                status: "scheduled",
                start: "2026-09-08T14:00:00+02:00",
                useTime: true
              }
            ]
          };
        }
        return {
          items: [
            {
              id: "t-2",
              title: "Call clinic",
              status: "scheduled",
              start: "2026-09-07T22:00:00.000Z",
              useTime: false
            }
          ]
        };
      }
    };

    const useCase = new SendMorningDigestUseCase({
      calendar,
      planning,
      timeZone: "Europe/Belgrade"
    });

    const digest = await useCase.buildDigest(
      new Date("2026-09-08T06:00:00.000Z")
    );

    expect(digest.localDate).toBe("2026-09-08");
    expect(digest.calendarEventsCount).toBe(1);
    expect(digest.planningTasksCount).toBe(2);
    expect(digest.text).toContain("Календарь:");
    expect(digest.text).toContain("10:00–10:30 — Daily sync");
    expect(digest.text).toContain("https://meet.google.com/abc-defg-hij");
    expect(digest.text).toContain("Задачи Singularity:");
    expect(digest.text).toContain("- 14:00 — Call clinic");
    expect(digest.text).toContain("\n- Call clinic");
    expect(digest.text).not.toContain("00:00 — Call clinic");
    expect(queries[0]?.startDateTimeTo).toBe("2026-09-08T21:59:59.999Z");
  });

  it("delivers once per local date via SQLite reservation and retries after a transient delivery failure", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    try {
      const digestRuns = new SqliteDigestRunRepository(database);
      const sentMessages: string[] = [];
      let shouldFail = true;

      const useCase = new SendMorningDigestUseCase({
        calendar: {
          async listEvents() {
            return [
              {
                id: "ev-1",
                title: "Morning call",
                startIso: "2026-09-08T09:00:00+02:00",
                endIso: "2026-09-08T09:30:00+02:00",
                allDay: false,
                meetingUrl: "https://meet.google.com/xyz-abcd-efg"
              }
            ];
          },
          async createEvent() {
            throw new Error("unused");
          }
        },
        digestRuns,
        resolveOwnerChatId: async () => "owner-chat-1",
        delivery: {
          async send(input) {
            if (shouldFail) {
              throw new Error("telegram timeout");
            }
            sentMessages.push(input.text);
          }
        },
        timeZone: "Europe/Belgrade"
      });

      const at0800 = new Date("2026-09-08T06:00:00.000Z"); // 08:00 CEST
      const firstAttempt = await useCase.executeScheduled({ now: at0800 });
      expect(firstAttempt.status).toBe("failed");
      expect(sentMessages).toHaveLength(0);

      // Reservation was released on send failure, so next tick succeeds.
      shouldFail = false;
      const secondAttempt = await useCase.executeScheduled({ now: at0800 });
      expect(secondAttempt.status).toBe("sent");
      expect(sentMessages).toHaveLength(1);

      // Subsequent ticks on the same local date do not duplicate.
      const thirdAttempt = await useCase.executeScheduled({ now: at0800 });
      expect(thirdAttempt.status).toBe("already_handled");
      expect(sentMessages).toHaveLength(1);
      expect(
        await digestRuns.hasSentRun("owner_morning_digest", "2026-09-08")
      ).toBe(true);
    } finally {
      database.close();
    }
  });

  it("triggers MorningDigestScheduler only within [08:00, 12:00) local time", async () => {
    const runs: Date[] = [];
    let currentTime = new Date("2026-09-08T05:59:00.000Z"); // 07:59 CEST

    const scheduler = new MorningDigestScheduler({
      runner: {
        async executeScheduled(input) {
          runs.push(input?.now ?? new Date());
          return { status: "sent", localDate: "2026-09-08", text: "ok" };
        }
      },
      timeZone: "Europe/Belgrade",
      digestTime: "08:00",
      catchUpUntil: "12:00",
      now: () => currentTime
    });

    await scheduler.tick();
    expect(runs).toHaveLength(0);

    currentTime = new Date("2026-09-08T06:00:00.000Z"); // 08:00 CEST
    await scheduler.tick();
    expect(runs).toHaveLength(1);

    currentTime = new Date("2026-09-08T10:00:00.000Z"); // 12:00 CEST (outside catch-up window)
    await scheduler.tick();
    expect(runs).toHaveLength(1);
  });
});
