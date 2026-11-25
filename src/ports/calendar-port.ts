import type { CalendarEvent } from "../core/domain/calendar/calendar-event.js";

export interface CalendarPort {
  listEvents(query: CalendarListEventsQuery): Promise<readonly CalendarEvent[]>;
  createEvent(input: CalendarEventCreateInput): Promise<CalendarEvent>;
}

export interface CalendarListEventsQuery {
  readonly startIso: string;
  readonly endIso: string;
  readonly calendarId?: string;
}

export interface CalendarEventCreateInput {
  readonly title: string;
  readonly startIso: string;
  readonly endIso: string;
  readonly timeZone: string;
  readonly meetingUrl?: string;
  readonly description?: string;
  readonly location?: string;
  readonly calendarId?: string;
  /** Optional deterministic base32hex event id for idempotent creates. */
  readonly id?: string;
}
