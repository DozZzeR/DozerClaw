import { describe, expect, it } from "vitest";

import { ScheduleEventUseCase } from "../../../../src/application/use-cases/calendar/schedule-event.js";
import type { CalendarEvent } from "../../../../src/core/domain/calendar/calendar-event.js";
import type {
  CalendarEventCreateInput,
  CalendarPort
} from "../../../../src/ports/calendar-port.js";
import type {
  PlanningItem,
  PlanningPort,
  PlanningTaskCreate
} from "../../../../src/ports/planning-port.js";

describe("ScheduleEventUseCase", () => {
  it("reuses an existing Google Calendar event for a bare Meet link and adds it only to Singularity", async () => {
    const calendar = new FakeCalendar([
      {
        id: "ev-1",
        title: "Design review",
        startIso: "2026-09-08T15:00:00+02:00",
        endIso: "2026-09-08T16:00:00+02:00",
        allDay: false,
        meetingUrl: "https://meet.google.com/abc-defg-hij"
      }
    ]);
    const planning = new FakePlanning([]);
    const useCase = new ScheduleEventUseCase({
      calendar,
      planning,
      timeZone: "Europe/Belgrade"
    });

    const result = await useCase.execute({
      text: "https://meet.google.com/abc-defg-hij",
      now: new Date("2026-09-07T10:00:00.000Z")
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.calendarStatus).toBe("already_exists");
      expect(result.planningStatus).toBe("created");
      expect(result.text).toContain("Design review");
      expect(result.text).toContain("Google Calendar: уже есть");
      expect(result.text).toContain("Singularity: добавлено");
    }
    expect(calendar.created).toHaveLength(0);
    expect(planning.created).toEqual([
      {
        title: "Design review",
        scope: "personal",
        startDateTime: "2026-09-08T15:00:00+02:00",
        note: "https://meet.google.com/abc-defg-hij"
      }
    ]);
  });

  it("asks for date/time clarification when a bare Meet link is not in Google Calendar", async () => {
    const calendar = new FakeCalendar([]);
    const planning = new FakePlanning([]);
    const useCase = new ScheduleEventUseCase({
      calendar,
      planning,
      timeZone: "Europe/Belgrade"
    });

    const result = await useCase.execute({
      text: "https://meet.google.com/abc-defg-hij",
      now: new Date("2026-09-07T10:00:00.000Z")
    });

    expect(result.status).toBe("needs_clarification");
    if (result.status === "needs_clarification") {
      expect(result.draft.url).toBe("https://meet.google.com/abc-defg-hij");
      expect(result.question).toContain("В Google Calendar этой встречи пока нет.");
    }
    expect(calendar.created).toHaveLength(0);
    expect(planning.created).toHaveLength(0);
  });

  it("asks which occurrence to sync when a recurring Meet link matches multiple Calendar events", async () => {
    const calendar = new FakeCalendar([
      {
        id: "ev-1",
        title: "Weekly standup",
        startIso: "2026-09-08T10:00:00+02:00",
        endIso: "2026-09-08T10:30:00+02:00",
        allDay: false,
        meetingUrl: "https://meet.google.com/abc-defg-hij"
      },
      {
        id: "ev-2",
        title: "Weekly standup",
        startIso: "2026-09-15T10:00:00+02:00",
        endIso: "2026-09-15T10:30:00+02:00",
        allDay: false,
        meetingUrl: "https://meet.google.com/abc-defg-hij"
      }
    ]);
    const useCase = new ScheduleEventUseCase({
      calendar,
      planning: new FakePlanning([]),
      timeZone: "Europe/Belgrade"
    });

    const result = await useCase.execute({
      text: "https://meet.google.com/abc-defg-hij",
      now: new Date("2026-09-07T10:00:00.000Z")
    });

    expect(result.status).toBe("needs_clarification");
    if (result.status === "needs_clarification") {
      expect(result.draft.candidateDates).toEqual(["2026-09-08", "2026-09-15"]);
      expect(result.question).toContain("2026-09-08");
      expect(result.question).toContain("2026-09-15");
    }
  });

  it("creates a webinar/post event in both Google Calendar and Singularity with local offset", async () => {
    const calendar = new FakeCalendar([]);
    const planning = new FakePlanning([]);
    const useCase = new ScheduleEventUseCase({
      calendar,
      planning,
      timeZone: "Europe/Belgrade"
    });

    const result = await useCase.execute({
      text: "Вебинар по ИИ завтра в 19:00 https://example.com/webinar",
      title: "Вебинар по ИИ",
      date: "2026-09-08",
      startTime: "19:00",
      durationMinutes: 90,
      url: "https://example.com/webinar",
      now: new Date("2026-09-07T10:00:00.000Z")
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.calendarStatus).toBe("created");
      expect(result.planningStatus).toBe("created");
    }
    expect(calendar.created).toEqual([
      {
        title: "Вебинар по ИИ",
        startIso: "2026-09-08T19:00:00+02:00",
        endIso: "2026-09-08T20:30:00+02:00",
        timeZone: "Europe/Belgrade",
        meetingUrl: "https://example.com/webinar"
      }
    ]);
    expect(planning.created).toEqual([
      {
        title: "Вебинар по ИИ",
        scope: "personal",
        startDateTime: "2026-09-08T19:00:00+02:00",
        note: "https://example.com/webinar"
      }
    ]);
  });

  it("reports degraded status when Google Calendar fails while Singularity succeeds", async () => {
    const failingCalendar: CalendarPort = {
      async listEvents() {
        throw new Error("HTTP 403 insufficientPermissions");
      },
      async createEvent() {
        throw new Error("HTTP 403 insufficientPermissions");
      }
    };
    const planning = new FakePlanning([]);
    const useCase = new ScheduleEventUseCase({
      calendar: failingCalendar,
      planning,
      timeZone: "Europe/Belgrade"
    });

    const result = await useCase.execute({
      text: "Созвон 2026-09-08 в 15:00 https://meet.google.com/abc-defg-hij",
      title: "Созвон",
      date: "2026-09-08",
      startTime: "15:00",
      now: new Date("2026-09-07T10:00:00.000Z")
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.calendarStatus).toBe("unavailable");
      expect(result.planningStatus).toBe("created");
      expect(result.text).toContain("Google Calendar: временно недоступен");
      expect(result.text).toContain("Singularity: добавлено");
    }
  });

  it("does not treat a same-title meeting at a different time/URL on the same day as a Singularity duplicate", async () => {
    const calendar = new FakeCalendar([
      {
        id: "ev-morning",
        title: "Созвон с командой",
        startIso: "2026-09-08T10:00:00+02:00",
        endIso: "2026-09-08T10:30:00+02:00",
        allDay: false,
        meetingUrl: "https://meet.google.com/aaa-bbbb-ccc"
      }
    ]);
    const planning = new FakePlanning([
      {
        id: "task-morning",
        title: "Созвон с командой",
        status: "scheduled",
        start: "2026-09-08T10:00:00+02:00",
        note: "https://meet.google.com/aaa-bbbb-ccc"
      }
    ]);
    const useCase = new ScheduleEventUseCase({
      calendar,
      planning,
      timeZone: "Europe/Belgrade"
    });

    const result = await useCase.execute({
      text: "Созвон с командой 2026-09-08 в 16:00 https://meet.google.com/ddd-eeee-fff",
      title: "Созвон с командой",
      date: "2026-09-08",
      startTime: "16:00",
      url: "https://meet.google.com/ddd-eeee-fff",
      now: new Date("2026-09-07T10:00:00.000Z")
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.calendarStatus).toBe("created");
      expect(result.planningStatus).toBe("created");
    }
    expect(planning.created).toHaveLength(1);
    expect(planning.created[0]?.startDateTime).toBe("2026-09-08T16:00:00+02:00");
  });
});

class FakeCalendar implements CalendarPort {
  readonly created: CalendarEventCreateInput[] = [];

  constructor(private readonly events: readonly CalendarEvent[]) {}

  async listEvents(): Promise<readonly CalendarEvent[]> {
    return this.events;
  }

  async createEvent(input: CalendarEventCreateInput): Promise<CalendarEvent> {
    this.created.push(input);
    return {
      id: `cal-${this.created.length}`,
      title: input.title,
      startIso: input.startIso,
      endIso: input.endIso,
      allDay: false,
      ...(input.meetingUrl ? { meetingUrl: input.meetingUrl } : {})
    };
  }
}

class FakePlanning implements PlanningPort {
  readonly created: PlanningTaskCreate[] = [];

  constructor(private readonly items: readonly PlanningItem[]) {}

  async queryPlanningState() {
    return { items: this.items };
  }

  async createPlanningTask(input: PlanningTaskCreate) {
    this.created.push(input);
    return {
      item: {
        id: `task-${this.created.length}`,
        title: input.title,
        status: "scheduled",
        ...(input.startDateTime ? { start: input.startDateTime } : {}),
        ...(input.note ? { note: input.note } : {})
      }
    };
  }
}
