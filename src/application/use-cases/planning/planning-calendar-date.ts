export function planningCalendarDate(
  instant: Date,
  timeZone: string
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(instant);
  const year = partValue(parts, "year");
  const month = partValue(parts, "month");
  const day = partValue(parts, "day");

  return `${year}-${month}-${day}`;
}

export function nextPlanningCalendarDate(
  instant: Date,
  timeZone: string
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(
    planningCalendarDate(instant, timeZone)
  );
  const year = match?.[1];
  const month = match?.[2];
  const day = match?.[3];

  if (!year || !month || !day) {
    throw new Error("Unable to resolve the next planning calendar date");
  }

  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1))
    .toISOString()
    .slice(0, 10);
}

function partValue(
  parts: readonly Intl.DateTimeFormatPart[],
  type: "year" | "month" | "day"
): string {
  const value = parts.find((part) => part.type === type)?.value;

  if (!value) {
    throw new Error(`Unable to resolve planning calendar ${type}`);
  }

  return value;
}
