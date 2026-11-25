import { describe, expect, it } from "vitest";

import { GoogleCalendarProvider } from "../../../src/infrastructure/providers/google/google-calendar-provider.js";

describe("GoogleCalendarProvider", () => {
  it("lists events across pages, skips cancelled items, and extracts Meet/webinar links", async () => {
    const requests: string[] = [];
    const responses = [
      {
        items: [
          {
            id: "ev-1",
            summary: "Product sync",
            status: "confirmed",
            start: { dateTime: "2026-09-08T15:00:00+02:00" },
            end: { dateTime: "2026-09-08T16:00:00+02:00" },
            hangoutLink: "https://meet.google.com/abc-defg-hij?authuser=0"
          },
          {
            id: "ev-cancelled",
            summary: "Cancelled call",
            status: "cancelled",
            start: { dateTime: "2026-09-08T17:00:00+02:00" },
            end: { dateTime: "2026-09-08T18:00:00+02:00" }
          }
        ],
        nextPageToken: "page-2"
      },
      {
        items: [
          {
            id: "ev-2",
            summary: "Architecture webinar",
            status: "confirmed",
            start: { dateTime: "2026-09-08T19:00:00+02:00" },
            end: { dateTime: "2026-09-08T20:00:00+02:00" },
            description: "Join here: https://example.com/webinar?id=42."
          },
          {
            id: "ev-3",
            summary: "School holiday",
            status: "confirmed",
            start: { date: "2026-09-08" },
            end: { date: "2026-09-09" }
          }
        ]
      }
    ];

    const provider = new GoogleCalendarProvider({
      accessToken: "cal-token",
      fetch: async (input) => {
        requests.push(String(input));
        const body = responses.shift() ?? { items: [] };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    });

    const events = await provider.listEvents({
      startIso: "2026-09-08T00:00:00+02:00",
      endIso: "2026-09-09T00:00:00+02:00"
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain("/calendar/v3/calendars/primary/events?");
    expect(requests[0]).toContain("singleEvents=true");
    expect(requests[1]).toContain("pageToken=page-2");
    expect(events).toEqual([
      {
        id: "ev-1",
        title: "Product sync",
        startIso: "2026-09-08T15:00:00+02:00",
        endIso: "2026-09-08T16:00:00+02:00",
        allDay: false,
        meetingUrl: "https://meet.google.com/abc-defg-hij"
      },
      {
        id: "ev-2",
        title: "Architecture webinar",
        startIso: "2026-09-08T19:00:00+02:00",
        endIso: "2026-09-08T20:00:00+02:00",
        allDay: false,
        meetingUrl: "https://example.com/webinar?id=42",
        description: "Join here: https://example.com/webinar?id=42."
      },
      {
        id: "ev-3",
        title: "School holiday",
        startIso: "2026-09-08",
        endIso: "2026-09-09",
        allDay: true
      }
    ]);
  });

  it("refreshes OAuth token and creates a timed calendar event", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];

    const provider = new GoogleCalendarProvider({
      oauth: {
        clientId: "cid",
        clientSecret: "csec",
        refreshToken: "rtok"
      },
      fetch: async (input, init) => {
        const url = String(input);
        calls.push({
          url,
          method: init?.method ?? "GET",
          ...(typeof init?.body === "string" ? { body: init.body } : {})
        });

        if (url === "https://oauth2.googleapis.com/token") {
          return new Response(
            JSON.stringify({ access_token: "fresh-token", expires_in: 3600 }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            id: "created-ev-1",
            summary: "Team call",
            start: { dateTime: "2026-09-08T15:00:00+02:00" },
            end: { dateTime: "2026-09-08T16:00:00+02:00" },
            location: "https://meet.google.com/abc-defg-hij"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    });

    const created = await provider.createEvent({
      title: "Team call",
      startIso: "2026-09-08T15:00:00+02:00",
      endIso: "2026-09-08T16:00:00+02:00",
      timeZone: "Europe/Belgrade",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      description: "Weekly sync"
    });

    expect(created.id).toBe("created-ev-1");
    expect(created.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(calls[0]?.url).toBe("https://oauth2.googleapis.com/token");
    expect(JSON.parse(calls[1]?.body ?? "{}")).toEqual({
      summary: "Team call",
      start: {
        dateTime: "2026-09-08T15:00:00+02:00",
        timeZone: "Europe/Belgrade"
      },
      end: {
        dateTime: "2026-09-08T16:00:00+02:00",
        timeZone: "Europe/Belgrade"
      },
      location: "https://meet.google.com/abc-defg-hij",
      description: "https://meet.google.com/abc-defg-hij\n\nWeekly sync"
    });
  });
});
