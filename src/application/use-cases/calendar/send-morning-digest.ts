import type { CalendarEvent } from "../../../core/domain/calendar/calendar-event.js";
import {
  extractGoogleMeetCode,
  extractUrls,
  formatLocalDateTimeParts,
  formatLocalTime,
  localDayBoundsIso,
  normalizeEventUrl,
  pickPrimaryEventUrl
} from "../../../core/domain/calendar/calendar-event.js";
import type { CalendarPort } from "../../../ports/calendar-port.js";
import type { DigestRunRepositoryPort } from "../../../ports/digest-run-repository-port.js";
import type { NotificationDeliveryPort } from "../../../ports/notification-delivery-port.js";
import type { PlanningItem, PlanningPort } from "../../../ports/planning-port.js";

export const DEFAULT_MORNING_DIGEST_KEY = "owner_morning_digest";

export interface SendMorningDigestDependencies {
  readonly calendar?: CalendarPort | undefined;
  readonly planning?: PlanningPort | undefined;
  readonly digestRuns?: DigestRunRepositoryPort | undefined;
  readonly delivery?: NotificationDeliveryPort | undefined;
  readonly resolveOwnerChatId?: () => Promise<string | undefined>;
  readonly onDigestSent?: (input: {
    readonly ownerChatId: string;
    readonly localDate: string;
    readonly text: string;
    readonly now: Date;
  }) => Promise<void>;
  readonly timeZone: string;
}

export interface MorningDigestBuildResult {
  readonly localDate: string;
  readonly text: string;
  readonly calendarEventsCount: number;
  readonly planningTasksCount: number;
  readonly calendarUnavailable: boolean;
  readonly planningUnavailable: boolean;
}

export type MorningDigestRunResult =
  | { readonly status: "sent"; readonly localDate: string; readonly text: string }
  | { readonly status: "already_handled"; readonly localDate: string }
  | { readonly status: "skipped"; readonly localDate: string; readonly reason: string }
  | { readonly status: "failed"; readonly localDate: string; readonly reason: string };

export class SendMorningDigestUseCase {
  constructor(private readonly dependencies: SendMorningDigestDependencies) {}

  async buildDigest(now: Date): Promise<MorningDigestBuildResult> {
    const timeZone = this.dependencies.timeZone;
    const { date: localDate } = formatLocalDateTimeParts(now, timeZone);
    const bounds = localDayBoundsIso(localDate, timeZone);

    let calendarEvents: readonly CalendarEvent[] = [];
    let calendarUnavailable = false;

    if (this.dependencies.calendar) {
      try {
        calendarEvents = await this.dependencies.calendar.listEvents({
          startIso: bounds.startIso,
          endIso: bounds.endIso
        });
      } catch {
        calendarUnavailable = true;
      }
    }

    let planningTasks: readonly PlanningItem[] = [];
    let planningUnavailable = false;

    if (this.dependencies.planning) {
      const planningEndIso = subtractOneMsIso(bounds.endIso);
      try {
        const [personal, family] = await Promise.all([
          this.dependencies.planning.queryPlanningState({
            text: "",
            scope: "personal",
            startDateTimeFrom: bounds.startIso,
            startDateTimeTo: planningEndIso
          }),
          this.dependencies.planning.queryPlanningState({
            text: "",
            scope: "family",
            startDateTimeFrom: bounds.startIso,
            startDateTimeTo: planningEndIso
          })
        ]);
        planningTasks = mergePlanningTasksById([
          ...personal.items,
          ...family.items
        ]);
      } catch {
        planningUnavailable = true;
      }
    }

    // Hide Singularity tasks that clearly mirror a Calendar event via the same meeting URL.
    const calendarUrls = new Set(
      calendarEvents
        .map((event) => event.meetingUrl)
        .filter((url): url is string => Boolean(url))
        .map(normalizeEventUrl)
    );
    const calendarMeetCodes = new Set(
      calendarEvents
        .map((event) => event.meetingUrl)
        .filter((url): url is string => Boolean(url))
        .map((url) => extractGoogleMeetCode(url))
        .filter((code): code is string => Boolean(code))
    );
    const distinctPlanningTasks = planningTasks.filter(
      (task) => !taskMirrorsCalendarUrl(task, calendarUrls, calendarMeetCodes)
    );

    const lines: string[] = [`Дайджест на ${localDate}:`];

    if (calendarEvents.length > 0) {
      lines.push("", "Календарь:");
      for (const event of calendarEvents) {
        const timePart = event.allDay
          ? "весь день"
          : `${formatLocalTime(event.startIso, timeZone)}–${formatLocalTime(event.endIso, timeZone)}`;
        lines.push(`- ${timePart} — ${event.title}`);
        if (event.meetingUrl) {
          lines.push(`  ${event.meetingUrl}`);
        }
      }
    }

    if (distinctPlanningTasks.length > 0) {
      lines.push("", "Задачи Singularity:");
      for (const task of distinctPlanningTasks) {
        const timePrefix = formatTaskTimePrefix(task, timeZone);
        lines.push(`- ${timePrefix}${task.title}`);
        const taskUrl = task.note ? pickPrimaryEventUrl(task.note) : undefined;
        if (taskUrl) {
          lines.push(`  ${taskUrl}`);
        }
      }
    }

    if (
      calendarEvents.length === 0 &&
      distinctPlanningTasks.length === 0 &&
      !calendarUnavailable &&
      !planningUnavailable
    ) {
      lines.push("", "На сегодня встреч и задач нет.");
    }

    if (calendarUnavailable) {
      lines.push("", "Примечание: Google Calendar временно недоступен.");
    }
    if (planningUnavailable) {
      lines.push("", "Примечание: Singularity временно недоступен.");
    }

    return {
      localDate,
      text: lines.join("\n"),
      calendarEventsCount: calendarEvents.length,
      planningTasksCount: distinctPlanningTasks.length,
      calendarUnavailable,
      planningUnavailable
    };
  }

  async executeScheduled(
    input: { readonly now?: Date; readonly digestKey?: string } = {}
  ): Promise<MorningDigestRunResult> {
    const now = input.now ?? new Date();
    const digestKey = input.digestKey ?? DEFAULT_MORNING_DIGEST_KEY;
    const { date: localDate } = formatLocalDateTimeParts(
      now,
      this.dependencies.timeZone
    );

    if (
      !this.dependencies.delivery ||
      !this.dependencies.resolveOwnerChatId ||
      !this.dependencies.digestRuns
    ) {
      return {
        status: "skipped",
        localDate,
        reason: "morning digest delivery or persistence is not configured"
      };
    }

    if (!this.dependencies.calendar && !this.dependencies.planning) {
      return {
        status: "skipped",
        localDate,
        reason: "neither calendar nor planning provider is configured"
      };
    }

    const ownerChatId = await this.dependencies.resolveOwnerChatId();
    if (!ownerChatId) {
      return {
        status: "skipped",
        localDate,
        reason: "owner private chat is not bootstrapped yet"
      };
    }

    const reserved = await this.dependencies.digestRuns.tryReserveRun(
      digestKey,
      localDate,
      now
    );

    if (!reserved) {
      return { status: "already_handled", localDate };
    }

    try {
      const digest = await this.buildDigest(now);
      const bothConfiguredAndDown =
        (!this.dependencies.calendar || digest.calendarUnavailable) &&
        (!this.dependencies.planning || digest.planningUnavailable);

      if (bothConfiguredAndDown) {
        await this.dependencies.digestRuns.releaseReservation(
          digestKey,
          localDate
        );

        return {
          status: "failed",
          localDate,
          reason: "all configured schedule providers are temporarily unavailable"
        };
      }

      await this.dependencies.delivery.send({
        provider: "telegram",
        providerChatId: ownerChatId,
        text: digest.text
      });

      try {
        await this.dependencies.digestRuns.markSent(digestKey, localDate, now);
      } catch {
        // Delivery already succeeded; keep the reservation row so the next tick
        // will not double-send the digest.
      }

      if (this.dependencies.onDigestSent) {
        try {
          await this.dependencies.onDigestSent({
            ownerChatId,
            localDate,
            text: digest.text,
            now
          });
        } catch {
          // Recording digest into short-term conversation context is best-effort
          // and must never roll back a delivered digest.
        }
      }

      return {
        status: "sent",
        localDate,
        text: digest.text
      };
    } catch (error) {
      await this.dependencies.digestRuns.releaseReservation(
        digestKey,
        localDate
      );

      return {
        status: "failed",
        localDate,
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

function mergePlanningTasksById(
  items: readonly PlanningItem[]
): readonly PlanningItem[] {
  const seen = new Set<string>();
  const merged: PlanningItem[] = [];

  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  return merged;
}

function taskMirrorsCalendarUrl(
  task: PlanningItem,
  calendarUrls: ReadonlySet<string>,
  calendarMeetCodes: ReadonlySet<string>
): boolean {
  if (calendarUrls.size === 0 && calendarMeetCodes.size === 0) {
    return false;
  }

  const haystack = `${task.title} ${task.note ?? ""}`;
  const meetCode = extractGoogleMeetCode(haystack);

  if (meetCode && calendarMeetCodes.has(meetCode)) {
    return true;
  }

  return extractUrls(haystack).some((url) =>
    calendarUrls.has(normalizeEventUrl(url))
  );
}

function formatTaskTimePrefix(
  task: PlanningItem,
  timeZone: string
): string {
  if (task.useTime === false) {
    return "";
  }

  const start = task.start;
  if (!start || !start.includes("T")) {
    return "";
  }

  // Legacy date-only tasks without explicit useTime are stored as T00:00:00.000Z.
  if (task.useTime === undefined && start.endsWith("T00:00:00.000Z")) {
    return "";
  }

  return `${formatLocalTime(start, timeZone)} — `;
}

function subtractOneMsIso(iso: string): string {
  const ms = Date.parse(iso);

  return Number.isNaN(ms) ? iso : new Date(ms - 1).toISOString();
}
