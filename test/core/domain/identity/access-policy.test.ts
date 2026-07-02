import { describe, expect, it } from "vitest";

import { createAdminSession } from "../../../../src/core/domain/identity/admin-session.js";
import { evaluateAccess } from "../../../../src/core/domain/identity/access-policy.js";
import type { Actor } from "../../../../src/core/domain/identity/actor.js";
import type { ChatContext } from "../../../../src/core/domain/identity/chat-context.js";

const owner: Actor = {
  id: "actor-owner",
  displayName: "Owner",
  role: "owner",
  status: "active"
};

const family: Actor = {
  id: "actor-family",
  displayName: "Family",
  role: "family",
  status: "active"
};

const ownerPrivateChat: ChatContext = {
  id: "chat-owner",
  kind: "owner_private",
  approved: true
};

describe("evaluateAccess", () => {
  it("allows an active owner in owner private chat to use owner read actions", () => {
    expect(
      evaluateAccess({
        actor: owner,
        chat: ownerPrivateChat,
        action: "owner_read",
        now: new Date("2026-07-02T20:00:00.000Z")
      })
    ).toEqual({ allowed: true });
  });

  it("requires active admin session for dangerous admin actions", () => {
    const now = new Date("2026-07-02T20:00:00.000Z");

    expect(
      evaluateAccess({
        actor: owner,
        chat: ownerPrivateChat,
        action: "admin_write",
        now
      })
    ).toEqual({ allowed: false, reason: "admin_session_required" });

    const adminSession = createAdminSession({
      id: "admin-session-1",
      actorId: owner.id,
      chatId: ownerPrivateChat.id,
      now,
      ttlMs: 5 * 60 * 1000
    });

    expect(
      evaluateAccess({
        actor: owner,
        chat: ownerPrivateChat,
        action: "admin_write",
        adminSession,
        now
      })
    ).toEqual({ allowed: true });
  });

  it("denies owner and admin actions for family actors", () => {
    expect(
      evaluateAccess({
        actor: family,
        chat: ownerPrivateChat,
        action: "owner_read",
        now: new Date("2026-07-02T20:00:00.000Z")
      })
    ).toEqual({ allowed: false, reason: "owner_required" });

    expect(
      evaluateAccess({
        actor: family,
        chat: ownerPrivateChat,
        action: "admin_write",
        now: new Date("2026-07-02T20:00:00.000Z")
      })
    ).toEqual({ allowed: false, reason: "owner_required" });
  });

  it("denies family actors in owner private chat", () => {
    expect(
      evaluateAccess({
        actor: family,
        chat: ownerPrivateChat,
        action: "family_read",
        now: new Date("2026-07-02T20:00:00.000Z")
      })
    ).toEqual({ allowed: false, reason: "owner_required" });
  });

  it("denies actions for pending or blocked actors", () => {
    expect(
      evaluateAccess({
        actor: { ...owner, status: "pending" },
        chat: ownerPrivateChat,
        action: "owner_read",
        now: new Date("2026-07-02T20:00:00.000Z")
      })
    ).toEqual({ allowed: false, reason: "actor_inactive" });
  });
});
