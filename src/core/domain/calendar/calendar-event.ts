export interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly startIso: string;
  readonly endIso: string;
  readonly allDay: boolean;
  readonly meetingUrl?: string;
  readonly htmlLink?: string;
  readonly description?: string;
  readonly location?: string;
}

const GOOGLE_MEET_PATTERN =
  /https?:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:[/?#][^\s<>()]*)?/iu;
const URL_PATTERN = /https?:\/\/[^\s<>()]+/giu;
const TRACKING_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
  "hs",
  "pli",
  "authuser"
]);

export function extractGoogleMeetCode(text: string): string | undefined {
  const match = GOOGLE_MEET_PATTERN.exec(text);

  return match?.[1]?.toLowerCase();
}

export function isBareGoogleMeetMessage(text: string): string | undefined {
  const trimmed = text.trim();
  const match =
    /^https?:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:[/?#][^\s<>()]*)?$/iu.exec(
      trimmed
    );

  return match?.[1]
    ? `https://meet.google.com/${match[1].toLowerCase()}`
    : undefined;
}

export function extractUrls(text: string): readonly string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const match of text.matchAll(URL_PATTERN)) {
    const cleaned = trimTrailingUrlPunctuation(match[0]);
    if (!cleaned) {
      continue;
    }

    const key = normalizeEventUrl(cleaned);
    if (!seen.has(key)) {
      seen.add(key);
      urls.push(cleaned);
    }
  }

  return urls;
}

export function pickPrimaryEventUrl(text: string): string | undefined {
  const urls = extractUrls(text);
  const meetUrl = urls.find((url) => Boolean(extractGoogleMeetCode(url)));

  if (meetUrl) {
    const code = extractGoogleMeetCode(meetUrl);
    return code ? `https://meet.google.com/${code}` : meetUrl;
  }

  return urls[0];
}

export function normalizeEventUrl(rawUrl: string): string {
  const trimmed = trimTrailingUrlPunctuation(rawUrl.trim());
  const meetCode = extractGoogleMeetCode(trimmed);

  if (meetCode) {
    return `https://meet.google.com/${meetCode}`;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hostname = parsed.hostname.toLowerCase();
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_QUERY_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = "";
    const serialized = parsed.toString();

    return serialized.endsWith("/") && parsed.pathname !== "/"
      ? serialized.slice(0, -1)
      : serialized;
  } catch {
    return trimmed.toLowerCase();
  }
}

export function localDateTimeToOffsetIso(
  date: string,
  time: string,
  timeZone: string
): string {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeParts = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());

  if (!dateParts || !timeParts) {
    throw new Error(`Invalid local date/time: ${date} ${time}`);
  }

  const year = Number(dateParts[1]);
  const month = Number(dateParts[2]);
  const day = Number(dateParts[3]);
  const hour = Number(timeParts[1]);
  const minute = Number(timeParts[2]);
  const second = Number(timeParts[3] ?? "0");

  const targetWallMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let guessUtcMs = targetWallMs;

  // Two iterations converge on the exact UTC instant even across DST boundaries.
  for (let i = 0; i < 2; i += 1) {
    const offsetMs = timeZoneOffsetMs(new Date(guessUtcMs), timeZone);
    guessUtcMs = targetWallMs - offsetMs;
  }

  const finalDate = new Date(guessUtcMs);
  return formatInstantWithTimeZoneOffset(finalDate, timeZone);
}

export function addMinutesToOffsetIso(
  startIso: string,
  minutes: number,
  timeZone: string
): string {
  const startMs = Date.parse(startIso);
  if (Number.isNaN(startMs)) {
    throw new Error(`Invalid ISO timestamp: ${startIso}`);
  }

  return formatInstantWithTimeZoneOffset(
    new Date(startMs + minutes * 60_000),
    timeZone
  );
}

export function localDayBoundsIso(
  date: string,
  timeZone: string
): { readonly startIso: string; readonly endIso: string } {
  return {
    startIso: localDateTimeToOffsetIso(date, "00:00", timeZone),
    endIso: localDateTimeToOffsetIso(nextDateString(date), "00:00", timeZone)
  };
}

export function formatLocalDateTimeParts(
  instant: Date,
  timeZone: string
): {
  readonly date: string;
  readonly time: string;
  readonly weekday: string;
  readonly offsetIso: string;
} {
  const parts = zonedNumericParts(instant, timeZone);
  const date = `${pad4(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}`;
  const time = `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long"
  }).format(instant);

  return {
    date,
    time,
    weekday,
    offsetIso: formatInstantWithTimeZoneOffset(instant, timeZone)
  };
}

export function formatLocalTime(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return iso;
  }

  const parts = zonedNumericParts(new Date(ms), timeZone);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function localDateFromIso(iso: string, timeZone: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) {
    return iso.trim();
  }

  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return undefined;
  }

  const parts = zonedNumericParts(new Date(ms), timeZone);
  return `${pad4(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function formatInstantWithTimeZoneOffset(
  instant: Date,
  timeZone: string
): string {
  const parts = zonedNumericParts(instant, timeZone);
  const offsetMinutes = Math.round(timeZoneOffsetMs(instant, timeZone) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absMinutes / 60);
  const offsetRemMinutes = absMinutes % 60;
  const suffix =
    offsetMinutes === 0 && timeZone.toUpperCase() === "UTC"
      ? "Z"
      : `${sign}${pad2(offsetHours)}:${pad2(offsetRemMinutes)}`;

  return `${pad4(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}${suffix}`;
}

function nextDateString(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) {
    throw new Error(`Invalid calendar date: ${date}`);
  }

  const next = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1)
  );

  return `${pad4(next.getUTCFullYear())}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedNumericParts(instant, timeZone);
  const wallAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  const truncatedInstantMs = Math.floor(instant.getTime() / 1000) * 1000;

  return wallAsUtcMs - truncatedInstantMs;
}

function zonedNumericParts(
  instant: Date,
  timeZone: string
): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const byType = new Map<string, number>();

  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") {
      byType.set(part.type, Number(part.value));
    }
  }

  return {
    year: byType.get("year") ?? 1970,
    month: byType.get("month") ?? 1,
    day: byType.get("day") ?? 1,
    hour: (byType.get("hour") ?? 0) % 24,
    minute: byType.get("minute") ?? 0,
    second: byType.get("second") ?? 0
  };
}

function trimTrailingUrlPunctuation(url: string): string {
  return url.replace(/[.,;:!?"'»\])]+$/u, "");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function pad4(value: number): string {
  return String(value).padStart(4, "0");
}
