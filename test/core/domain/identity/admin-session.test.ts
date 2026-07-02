import { describe, expect, it } from "vitest";

import {
  createAdminSession,
  isAdminSessionActive,
  refreshAdminSession
} from "../../../../src/core/domain/identity/admin-session.js";

describe("admin sessions", () => {
  it("is active before expiry and inactive after expiry", () => {
    const session = createAdminSession({
      id: "admin-session-1",
      actorId: "actor-owner",
      chatId: "chat-owner",
      now: new Date("2026-07-02T20:00:00.000Z"),
      ttlMs: 5 * 60 * 1000
    });

    expect(
      isAdminSessionActive(session, new Date("2026-07-02T20:04:59.000Z"))
    ).toBe(true);
    expect(
      isAdminSessionActive(session, new Date("2026-07-02T20:05:00.000Z"))
    ).toBe(false);
  });

  it("refreshes expiry from the latest admin activity", () => {
    const session = createAdminSession({
      id: "admin-session-1",
      actorId: "actor-owner",
      chatId: "chat-owner",
      now: new Date("2026-07-02T20:00:00.000Z"),
      ttlMs: 5 * 60 * 1000
    });

    const refreshed = refreshAdminSession({
      session,
      now: new Date("2026-07-02T20:03:00.000Z"),
      ttlMs: 5 * 60 * 1000
    });

    expect(refreshed.lastActivityAt).toEqual(
      new Date("2026-07-02T20:03:00.000Z")
    );
    expect(refreshed.expiresAt).toEqual(new Date("2026-07-02T20:08:00.000Z"));
  });
});
