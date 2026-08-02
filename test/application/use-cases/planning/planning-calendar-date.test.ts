import { describe, expect, it } from "vitest";

import {
  nextPlanningCalendarDate,
  planningCalendarDate
} from "../../../../src/application/use-cases/planning/planning-calendar-date.js";

describe("planning calendar dates", () => {
  it("uses the calendar date in the configured time zone", () => {
    expect(
      planningCalendarDate(
        new Date("2026-07-23T22:30:00.000Z"),
        "Europe/Moscow"
      )
    ).toBe("2026-07-24");
  });

  it("advances across a local calendar year boundary", () => {
    expect(
      nextPlanningCalendarDate(
        new Date("2026-12-31T21:30:00.000Z"),
        "America/New_York"
      )
    ).toBe("2027-01-01");
  });
});
