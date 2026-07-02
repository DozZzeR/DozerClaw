import { describe, expect, it } from "vitest";

import { routeCommand } from "../../../../src/application/use-cases/messaging/route-command.js";

describe("routeCommand", () => {
  it.each(["/health", "health", "status"])(
    "routes %s to system health owner read",
    (text) => {
      expect(routeCommand(text)).toEqual({
        kind: "system_health",
        action: "owner_read",
        normalizedText: text
      });
    }
  );

  it("routes admin mode activation to owner read", () => {
    expect(routeCommand("/admin")).toEqual({
      kind: "admin_mode_activate",
      action: "owner_read",
      normalizedText: "/admin"
    });
  });

  it("routes explicit restart command to admin write", () => {
    expect(routeCommand("/restart service")).toEqual({
      kind: "admin_write",
      action: "admin_write",
      normalizedText: "/restart service"
    });
  });

  it("routes ordinary text to family message fallback", () => {
    expect(routeCommand("remember that mom likes jasmine tea")).toEqual({
      kind: "family_message",
      action: "family_read",
      normalizedText: "remember that mom likes jasmine tea"
    });
  });

  it("trims and lowercases only for matching, not for normalized text", () => {
    expect(routeCommand("  STATUS  ")).toEqual({
      kind: "system_health",
      action: "owner_read",
      normalizedText: "STATUS"
    });
  });
});
