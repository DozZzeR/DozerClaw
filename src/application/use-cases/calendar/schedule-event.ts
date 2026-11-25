import type { CalendarEvent } from "../../../core/domain/calendar/calendar-event.js";
import {
  addMinutesToOffsetIso,
  extractGoogleMeetCode,
  extractUrls,
  formatLocalTime,
  localDateFromIso,
  localDateTimeToOffsetIso,
  localDayBoundsIso,
  normalizeEventUrl,
  pickPrimaryEventUrl
} from "../../../core/domain/calendar/calendar-event.js";
import type { CalendarPort } from "../../../ports/calendar-port.js";
import type {
  PlanningItem,
  PlanningPort,
  PlanningScope
} from "../../../ports/planning-port.js";

const DEFAULT_DURATION_MINUTES = 60;
const CALENDAR_URL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const CALENDAR_URL_LOOKAHEAD_MS = 60 * 24 * 60 * 60 * 1000;

export interface ScheduleEventDependencies {
  readonly calendar?: CalendarPort | undefined;
  readonly planning?: PlanningPort | undefined;
  readonly timeZone: string;
}

export interface ScheduleEventInput {
  readonly text: string;
  readonly title?: string | undefined;
  readonly date?: string | undefined;
  readonly startTime?: string | undefined;
  readonly durationMinutes?: number | undefined;
  readonly url?: string | undefined;
  readonly notes?: string | undefined;
  readonly scope?: PlanningScope | undefined;
  readonly now: Date;
}

export interface PendingEventScheduleDraft {
  readonly originalText: string;
  readonly title?: string;
  readonly date?: string;
  readonly startTime?: string;
  readonly durationMinutes?: number;
  readonly url?: string;
  readonly notes?: string;
  readonly scope?: PlanningScope;
  readonly candidateDates?: readonly string[];
}

export type SyncOutcomeStatus =
  | "created"
  | "already_exists"
  | "unavailable"
  | "not_configured";

export type ScheduleEventResult =
  | {
      readonly status: "completed";
      readonly text: string;
      readonly calendarStatus: SyncOutcomeStatus;
      readonly planningStatus: SyncOutcomeStatus;
    }
  | {
      readonly status: "needs_clarification";
      readonly question: string;
      readonly draft: PendingEventScheduleDraft;
    };

export class ScheduleEventUseCase {
  constructor(private readonly dependencies: ScheduleEventDependencies) {}

  async execute(input: ScheduleEventInput): Promise<ScheduleEventResult> {
    const timeZone = this.dependencies.timeZone;
    const url = input.url?.trim() || pickPrimaryEventUrl(input.text);
    const scope: PlanningScope = input.scope ?? "personal";
    const durationMinutes =
      input.durationMinutes && input.durationMinutes > 0
        ? Math.round(input.durationMinutes)
        : DEFAULT_DURATION_MINUTES;

    if (!this.dependencies.calendar && !this.dependencies.planning) {
      return {
        status: "completed",
        calendarStatus: "not_configured",
        planningStatus: "not_configured",
        text: "Ни Google Calendar, ни Singularity сейчас не подключены."
      };
    }

    let existingCalendarEvent: CalendarEvent | undefined;
    let calendarStatus: SyncOutcomeStatus = this.dependencies.calendar
      ? "created"
      : "not_configured";

    // Step 1: Check Google Calendar for an existing event (by URL/Meet code or slot).
    if (this.dependencies.calendar) {
      const lookup = await this.findExistingCalendarEvent({
        url,
        title: input.title,
        date: input.date,
        startTime: input.startTime,
        now: input.now
      });

      if (lookup.status === "unavailable") {
        calendarStatus = "unavailable";
      } else if (lookup.status === "ambiguous") {
        const candidateLines = lookup.events
          .slice(0, 5)
          .map((event) => {
            const eventDate = localDateFromIso(event.startIso, timeZone) ?? event.startIso;
            const eventTime = event.allDay
              ? "весь день"
              : formatLocalTime(event.startIso, timeZone);
            return `- ${eventDate} ${eventTime} — ${event.title}`;
          });
        const candidateDates = lookup.events
          .slice(0, 5)
          .map((event) => localDateFromIso(event.startIso, timeZone))
          .filter((value): value is string => Boolean(value));

        return {
          status: "needs_clarification",
          question: [
            "Нашла несколько встреч с этой ссылкой в Google Calendar:",
            ...candidateLines,
            "Уточни дату (YYYY-MM-DD или «завтра»), какую именно добавить в Singularity."
          ].join("\n"),
          draft: {
            originalText: input.text,
            ...(input.title ? { title: input.title } : {}),
            ...(url ? { url } : {}),
            ...(input.notes ? { notes: input.notes } : {}),
            scope,
            ...(candidateDates.length > 0 ? { candidateDates } : {})
          }
        };
      } else if (lookup.status === "found") {
        existingCalendarEvent = lookup.event;
        calendarStatus = "already_exists";
      }
    }

    // Step 2: Resolve concrete event title, startIso, endIso, and localDate.
    let resolvedTitle =
      existingCalendarEvent?.title ?? input.title?.trim() ?? undefined;
    let startIso = existingCalendarEvent?.startIso;
    let endIso = existingCalendarEvent?.endIso;
    let localDate = startIso
      ? localDateFromIso(startIso, timeZone)
      : input.date?.trim();
    const resolvedUrl = existingCalendarEvent?.meetingUrl ?? url;

    if (!startIso) {
      if (!input.date || !input.startTime) {
        const missingParts: string[] = [];
        if (!input.date) {
          missingParts.push("дату");
        }
        if (!input.startTime) {
          missingParts.push("время");
        }
        if (!resolvedTitle) {
          missingParts.push("название");
        }

        const checkedCalendarNote =
          this.dependencies.calendar && calendarStatus !== "unavailable" && url
            ? "В Google Calendar этой встречи пока нет. "
            : "";

        return {
          status: "needs_clarification",
          question: `${checkedCalendarNote}Уточни ${missingParts.join(", ")} (например: «завтра в 15:00, созвон с командой»).`,
          draft: {
            originalText: input.text,
            ...(resolvedTitle ? { title: resolvedTitle } : {}),
            ...(input.date ? { date: input.date } : {}),
            ...(input.startTime ? { startTime: input.startTime } : {}),
            durationMinutes,
            ...(resolvedUrl ? { url: resolvedUrl } : {}),
            ...(input.notes ? { notes: input.notes } : {}),
            scope
          }
        };
      }

      startIso = localDateTimeToOffsetIso(input.date, input.startTime, timeZone);
      endIso = addMinutesToOffsetIso(startIso, durationMinutes, timeZone);
      localDate = input.date;
    }

    if (!resolvedTitle) {
      resolvedTitle = resolvedUrl && extractGoogleMeetCode(resolvedUrl)
        ? "Встреча Google Meet"
        : "Событие";
    }

    if (!endIso) {
      endIso = addMinutesToOffsetIso(startIso, durationMinutes, timeZone);
    }

    // Step 3: Create event in Google Calendar if missing and configured.
    if (this.dependencies.calendar && calendarStatus === "created") {
      try {
        await this.dependencies.calendar.createEvent({
          title: resolvedTitle,
          startIso,
          endIso,
          timeZone,
          ...(resolvedUrl ? { meetingUrl: resolvedUrl } : {}),
          ...(input.notes ? { description: input.notes } : {})
        });
        calendarStatus = "created";
      } catch {
        calendarStatus = "unavailable";
      }
    }

    // Step 4: Check and create task in Singularity (with exact time + note URL).
    let planningStatus: SyncOutcomeStatus = this.dependencies.planning
      ? "created"
      : "not_configured";

    if (this.dependencies.planning) {
      planningStatus = await this.syncToSingularity({
        title: resolvedTitle,
        localDate: localDate ?? localDateFromIso(startIso, timeZone) ?? "",
        startIso,
        url: resolvedUrl,
        notes: input.notes,
        scope,
        allDay: existingCalendarEvent?.allDay ?? false
      });
    }

    const timeLabel = existingCalendarEvent?.allDay
      ? "весь день"
      : `${formatLocalTime(startIso, timeZone)}–${formatLocalTime(endIso, timeZone)}`;
    const dateLabel = localDate ?? localDateFromIso(startIso, timeZone) ?? startIso;

    const lines = [
      `Событие: ${resolvedTitle}`,
      `Когда: ${dateLabel}, ${timeLabel}`,
      ...(resolvedUrl ? [`Ссылка: ${resolvedUrl}`] : []),
      `Google Calendar: ${formatStatusLabel(calendarStatus)}`,
      `Singularity: ${formatStatusLabel(planningStatus)}`
    ];

    return {
      status: "completed",
      calendarStatus,
      planningStatus,
      text: lines.join("\n")
    };
  }

  private async findExistingCalendarEvent(input: {
    readonly url: string | undefined;
    readonly title: string | undefined;
    readonly date: string | undefined;
    readonly startTime: string | undefined;
    readonly now: Date;
  }): Promise<
    | { readonly status: "found"; readonly event: CalendarEvent }
    | { readonly status: "ambiguous"; readonly events: readonly CalendarEvent[] }
    | { readonly status: "not_found" }
    | { readonly status: "unavailable" }
  > {
    if (!this.dependencies.calendar) {
      return { status: "not_found" };
    }

    const timeZone = this.dependencies.timeZone;
    const normalizedUrl = input.url ? normalizeEventUrl(input.url) : undefined;
    const meetCode = input.url ? extractGoogleMeetCode(input.url) : undefined;

    let windowStartIso: string;
    let windowEndIso: string;

    if (input.date) {
      const bounds = localDayBoundsIso(input.date, timeZone);
      windowStartIso = bounds.startIso;
      windowEndIso = bounds.endIso;
    } else if (normalizedUrl) {
      windowStartIso = new Date(
        input.now.getTime() - CALENDAR_URL_LOOKBACK_MS
      ).toISOString();
      windowEndIso = new Date(
        input.now.getTime() + CALENDAR_URL_LOOKAHEAD_MS
      ).toISOString();
    } else {
      return { status: "not_found" };
    }

    let events: readonly CalendarEvent[];
    try {
      events = await this.dependencies.calendar.listEvents({
        startIso: windowStartIso,
        endIso: windowEndIso
      });
    } catch {
      return { status: "unavailable" };
    }

    if (normalizedUrl) {
      const urlMatches = events.filter((event) =>
        calendarEventMatchesUrl(event, normalizedUrl, meetCode)
      );

      if (urlMatches.length === 1) {
        return { status: "found", event: urlMatches[0]! };
      }

      if (urlMatches.length > 1) {
        if (input.date && input.startTime) {
          const targetMs = Date.parse(
            localDateTimeToOffsetIso(input.date, input.startTime, timeZone)
          );
          const exactSlot = urlMatches.find(
            (event) => Math.abs(Date.parse(event.startIso) - targetMs) <= 5 * 60_000
          );
          if (exactSlot) {
            return { status: "found", event: exactSlot };
          }
        }

        return { status: "ambiguous", events: urlMatches };
      }
    }

    if (input.date && input.startTime && input.title) {
      const targetMs = Date.parse(
        localDateTimeToOffsetIso(input.date, input.startTime, timeZone)
      );
      const normalizedTitle = normalizeComparableTitle(input.title);
      const slotMatch = events.find(
        (event) =>
          normalizeComparableTitle(event.title) === normalizedTitle &&
          Math.abs(Date.parse(event.startIso) - targetMs) <= 5 * 60_000
      );

      if (slotMatch) {
        return { status: "found", event: slotMatch };
      }
    }

    return { status: "not_found" };
  }

  private async syncToSingularity(input: {
    readonly title: string;
    readonly localDate: string;
    readonly startIso: string;
    readonly url: string | undefined;
    readonly notes: string | undefined;
    readonly scope: PlanningScope;
    readonly allDay: boolean;
  }): Promise<SyncOutcomeStatus> {
    if (!this.dependencies.planning) {
      return "not_configured";
    }

    const timeZone = this.dependencies.timeZone;
    const normalizedUrl = input.url ? normalizeEventUrl(input.url) : undefined;
    const meetCode = input.url ? extractGoogleMeetCode(input.url) : undefined;
    const normalizedTitle = normalizeComparableTitle(input.title);

    try {
      const bounds = input.localDate
        ? localDayBoundsIso(input.localDate, timeZone)
        : undefined;
      const existing = await this.dependencies.planning.queryPlanningState({
        text: "",
        scope: input.scope,
        ...(bounds
          ? {
              startDateTimeFrom: bounds.startIso,
              startDateTimeTo: subtractOneMsIso(bounds.endIso)
            }
          : {})
      });

      const duplicate = existing.items.find((item) =>
        planningItemMatchesEvent(
          item,
          normalizedTitle,
          input.startIso,
          input.allDay,
          normalizedUrl,
          meetCode
        )
      );

      if (duplicate) {
        return "already_exists";
      }

      if (!this.dependencies.planning.createPlanningTask) {
        return "not_configured";
      }

      const note = buildSingularityNote(input.url, input.notes);
      await this.dependencies.planning.createPlanningTask({
        title: input.title,
        scope: input.scope,
        ...(input.allDay
          ? { date: input.localDate }
          : { startDateTime: input.startIso }),
        ...(note ? { note } : {})
      });

      return "created";
    } catch {
      return "unavailable";
    }
  }
}

function calendarEventMatchesUrl(
  event: CalendarEvent,
  normalizedUrl: string,
  meetCode: string | undefined
): boolean {
  const haystack = [
    event.meetingUrl,
    event.location,
    event.description,
    event.title
  ]
    .filter(Boolean)
    .join(" ");

  if (meetCode && extractGoogleMeetCode(haystack) === meetCode) {
    return true;
  }

  return extractUrls(haystack).some(
    (candidate) => normalizeEventUrl(candidate) === normalizedUrl
  );
}

function planningItemMatchesEvent(
  item: PlanningItem,
  normalizedTitle: string,
  startIso: string,
  allDay: boolean,
  normalizedUrl: string | undefined,
  meetCode: string | undefined
): boolean {
  const haystack = `${item.title} ${item.note ?? ""}`;
  const itemUrls = extractUrls(haystack).map(normalizeEventUrl);

  if (normalizedUrl) {
    if (meetCode && extractGoogleMeetCode(haystack) === meetCode) {
      return true;
    }
    if (itemUrls.includes(normalizedUrl)) {
      return true;
    }
    // If both the event and the existing task have URLs and they differ, they are distinct events.
    if (itemUrls.length > 0) {
      return false;
    }
  }

  if (normalizeComparableTitle(item.title) !== normalizedTitle) {
    return false;
  }

  if (allDay) {
    return true;
  }

  if (!item.start) {
    return false;
  }

  const itemStartMs = Date.parse(item.start);
  const targetStartMs = Date.parse(startIso);
  if (Number.isNaN(itemStartMs) || Number.isNaN(targetStartMs)) {
    return false;
  }

  return Math.abs(itemStartMs - targetStartMs) <= 5 * 60_000;
}

function buildSingularityNote(
  url: string | undefined,
  notes: string | undefined
): string | undefined {
  const parts: string[] = [];
  if (url && (!notes || !notes.includes(url))) {
    parts.push(url);
  }
  if (notes?.trim()) {
    parts.push(notes.trim());
  }

  return parts.length > 0 ? parts.join("\n") : undefined;
}

function normalizeComparableTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function formatStatusLabel(status: SyncOutcomeStatus): string {
  switch (status) {
    case "created":
      return "добавлено";
    case "already_exists":
      return "уже есть";
    case "unavailable":
      return "временно недоступен";
    case "not_configured":
      return "не подключен";
  }
}

function subtractOneMsIso(iso: string): string {
  const ms = Date.parse(iso);

  return Number.isNaN(ms) ? iso : new Date(ms - 1).toISOString();
}
