import type { CalendarEvent } from "../../../core/domain/calendar/calendar-event.js";
import {
  extractGoogleMeetCode,
  pickPrimaryEventUrl
} from "../../../core/domain/calendar/calendar-event.js";
import type {
  CalendarEventCreateInput,
  CalendarListEventsQuery,
  CalendarPort
} from "../../../ports/calendar-port.js";
import type { GoogleOAuthCredentials } from "./google-oauth-token-client.js";
import {
  formatGoogleErrorDetail,
  GoogleOAuthTokenClient
} from "./google-oauth-token-client.js";

const MAX_CALENDAR_PAGES = 20;

export interface GoogleCalendarProviderOptions {
  readonly accessToken?: string;
  readonly oauth?: GoogleOAuthCredentials;
  readonly apiBaseUrl?: string;
  readonly calendarId?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly requestTimeoutMs?: number;
}

interface GoogleCalendarEventsListResponse {
  readonly items?: readonly unknown[];
  readonly nextPageToken?: string;
}

export class GoogleCalendarProvider implements CalendarPort {
  private readonly apiBaseUrl: string;
  private readonly defaultCalendarId: string;
  private readonly tokenClient: GoogleOAuthTokenClient;

  constructor(options: GoogleCalendarProviderOptions) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://www.googleapis.com";
    this.defaultCalendarId = options.calendarId?.trim() || "primary";
    this.tokenClient = new GoogleOAuthTokenClient({
      serviceLabel: "Google Calendar",
      ...(options.accessToken ? { accessToken: options.accessToken } : {}),
      ...(options.oauth ? { oauth: options.oauth } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.requestTimeoutMs
        ? { requestTimeoutMs: options.requestTimeoutMs }
        : {})
    });
  }

  async listEvents(
    query: CalendarListEventsQuery
  ): Promise<readonly CalendarEvent[]> {
    const calendarId = query.calendarId?.trim() || this.defaultCalendarId;
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_CALENDAR_PAGES; page += 1) {
      const url = new URL(
        `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        this.apiBaseUrl
      );
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "250");
      url.searchParams.set("timeMin", query.startIso);
      url.searchParams.set("timeMax", query.endIso);
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await this.tokenClient.fetchWithTimeout(url.toString(), {
        method: "GET",
        headers: {
          authorization: `Bearer ${await this.tokenClient.getAccessToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(
          `Google Calendar events list failed: HTTP ${response.status}${await formatGoogleErrorDetail(response)}`
        );
      }

      const payload =
        (await response.json()) as GoogleCalendarEventsListResponse;
      const items = Array.isArray(payload.items) ? payload.items : [];

      for (const item of items) {
        const parsed = toCalendarEvent(item);
        if (parsed) {
          events.push(parsed);
        }
      }

      if (!payload.nextPageToken) {
        break;
      }
      pageToken = payload.nextPageToken;
    }

    return events;
  }

  async createEvent(input: CalendarEventCreateInput): Promise<CalendarEvent> {
    const calendarId = input.calendarId?.trim() || this.defaultCalendarId;
    const url = new URL(
      `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      this.apiBaseUrl
    );
    const description = buildEventDescription(
      input.meetingUrl,
      input.description
    );
    const location = input.location ?? input.meetingUrl;
    const body: Record<string, unknown> = {
      summary: input.title,
      start: {
        dateTime: input.startIso,
        timeZone: input.timeZone
      },
      end: {
        dateTime: input.endIso,
        timeZone: input.timeZone
      },
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      ...(input.id ? { id: input.id } : {})
    };

    const response = await this.tokenClient.fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.tokenClient.getAccessToken()}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(
        `Google Calendar event create failed: HTTP ${response.status}${await formatGoogleErrorDetail(response)}`
      );
    }

    const created = toCalendarEvent((await response.json()) as unknown);

    if (!created) {
      throw new Error("Google Calendar event create response was incomplete");
    }

    return created;
  }
}

function buildEventDescription(
  meetingUrl: string | undefined,
  description: string | undefined
): string | undefined {
  const parts: string[] = [];

  if (meetingUrl && (!description || !description.includes(meetingUrl))) {
    parts.push(meetingUrl);
  }
  if (description?.trim()) {
    parts.push(description.trim());
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function toCalendarEvent(value: unknown): CalendarEvent | undefined {
  if (!isRecord(value) || value.status === "cancelled") {
    return undefined;
  }

  const id = stringField(value, "id");
  const start = isRecord(value.start) ? value.start : undefined;
  const end = isRecord(value.end) ? value.end : undefined;

  if (!id || !start) {
    return undefined;
  }

  const startDateTime = stringField(start, "dateTime");
  const startDate = stringField(start, "date");
  const endDateTime = end ? stringField(end, "dateTime") : undefined;
  const endDate = end ? stringField(end, "date") : undefined;
  const startIso = startDateTime ?? startDate;
  const endIso = endDateTime ?? endDate ?? startIso;

  if (!startIso || !endIso) {
    return undefined;
  }

  const title = stringField(value, "summary") ?? "(Без названия)";
  const description = stringField(value, "description");
  const location = stringField(value, "location");
  const htmlLink = stringField(value, "htmlLink");
  const meetingUrl = extractEventMeetingUrl(value, location, description);

  return {
    id,
    title,
    startIso,
    endIso,
    allDay: Boolean(!startDateTime && startDate),
    ...(meetingUrl ? { meetingUrl } : {}),
    ...(htmlLink ? { htmlLink } : {}),
    ...(description ? { description } : {}),
    ...(location ? { location } : {})
  };
}

function extractEventMeetingUrl(
  event: Record<string, unknown>,
  location: string | undefined,
  description: string | undefined
): string | undefined {
  const hangoutLink = stringField(event, "hangoutLink");
  if (hangoutLink) {
    return canonicalMeetOrRaw(hangoutLink);
  }

  const conferenceData = isRecord(event.conferenceData)
    ? event.conferenceData
    : undefined;
  const entryPoints = Array.isArray(conferenceData?.entryPoints)
    ? conferenceData.entryPoints
    : [];

  for (const entry of entryPoints) {
    if (!isRecord(entry)) {
      continue;
    }
    const uri = stringField(entry, "uri");
    const entryType = stringField(entry, "entryPointType");
    if (uri && (!entryType || entryType === "video")) {
      return canonicalMeetOrRaw(uri);
    }
  }

  const fromLocation = location ? pickPrimaryEventUrl(location) : undefined;
  if (fromLocation) {
    return fromLocation;
  }

  return description ? pickPrimaryEventUrl(description) : undefined;
}

function canonicalMeetOrRaw(url: string): string {
  const meetCode = extractGoogleMeetCode(url);

  return meetCode ? `https://meet.google.com/${meetCode}` : url;
}

function stringField(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
