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
    expect(routeCommand("/admin 1234")).toEqual({
      kind: "admin_mode_activate",
      action: "owner_read",
      normalizedText: "/admin 1234"
    });
  });

  it("routes start command to family read", () => {
    expect(routeCommand("/start")).toEqual({
      kind: "start",
      action: "family_read",
      normalizedText: "/start"
    });
  });

  it("routes pending access list to owner read", () => {
    expect(routeCommand("/pending")).toEqual({
      kind: "pending_access_requests",
      action: "owner_read",
      normalizedText: "/pending"
    });
  });

  it("routes access review commands to admin write", () => {
    expect(routeCommand("/approve actor-1")).toEqual({
      kind: "approve_access_request",
      action: "admin_write",
      normalizedText: "/approve actor-1"
    });
    expect(routeCommand("/reject actor-1")).toEqual({
      kind: "reject_access_request",
      action: "admin_write",
      normalizedText: "/reject actor-1"
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
