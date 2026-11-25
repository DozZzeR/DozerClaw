import { describe, expect, it } from "vitest";

import { handlePendingEventScheduleDecision } from "../../../../src/application/use-cases/messaging/pending-handlers/event-schedule-handler.js";
import type { AcceptedMessageContext } from "../../../../src/application/use-cases/messaging/process-inbound-message.js";
import type { PendingEventScheduleDecision } from "../../../../src/ports/state-repository-port.js";

const ownerContext: AcceptedMessageContext = {
  provider: "telegram",
  actor: {
    id: "actor-owner",
    displayName: "Alex",
    role: "owner",
    status: "active"
  },
  chat: {
    id: "chat-owner",
    kind: "owner_private",
    approved: true
  },
  text: "",
  attachments: [],
  action: "family_read",
  receivedAt: new Date("2026-09-07T10:00:00.000Z")
};

describe("handlePendingEventScheduleDecision", () => {
  it("preserves already-known pending.title when user replies with time and polite filler words", async () => {
    let seenTitle: string | undefined;
    let cleared = false;

    const pending: PendingEventScheduleDecision = {
      chatId: "chat-owner",
      actorId: "actor-owner",
      originalText: "Вебинар по архитектуре 2026-09-08 https://example.com/webinar",
      title: "Вебинар по архитектуре",
      date: "2026-09-08",
      url: "https://example.com/webinar",
      createdAt: new Date("2026-09-07T09:55:00.000Z"),
      expiresAt: new Date("2026-09-07T10:25:00.000Z")
    };

    const reply = await handlePendingEventScheduleDecision(
      { ...ownerContext, text: "в 19:00, спасибо" },
      pending,
      {
        eventScheduler: {
          async execute(input) {
            seenTitle = input.title;
            return {
              status: "completed",
              calendarStatus: "created",
              planningStatus: "created",
              text: "ok"
            };
          }
        },
        store: {
          async findActiveByChatId() {
            return pending;
          },
          async save() {},
          async clearByChatId() {
            cleared = true;
          }
        },
        timeZone: "Europe/Belgrade",
        now: () => new Date("2026-09-07T10:00:00.000Z")
      }
    );

    expect(seenTitle).toBe("Вебинар по архитектуре");
    expect(cleared).toBe(true);
    expect(reply?.text).toBe("ok");
  });

  it("clears pending and yields control when user switches to an unrelated command", async () => {
    let cleared = false;
    let schedulerCalled = false;

    const pending: PendingEventScheduleDecision = {
      chatId: "chat-owner",
      actorId: "actor-owner",
      originalText: "https://meet.google.com/abc-defg-hij",
      url: "https://meet.google.com/abc-defg-hij",
      createdAt: new Date("2026-09-07T09:55:00.000Z"),
      expiresAt: new Date("2026-09-07T10:25:00.000Z")
    };

    const reply = await handlePendingEventScheduleDecision(
      { ...ownerContext, text: "купи молоко" },
      pending,
      {
        eventScheduler: {
          async execute() {
            schedulerCalled = true;
            return {
              status: "completed",
              calendarStatus: "created",
              planningStatus: "created",
              text: "unexpected"
            };
          }
        },
        intentClassifier: {
          async execute() {
            return {
              kind: "record_shopping_item",
              title: "молоко"
            };
          }
        },
        store: {
          async findActiveByChatId() {
            return pending;
          },
          async save() {},
          async clearByChatId() {
            cleared = true;
          }
        },
        timeZone: "Europe/Belgrade",
        now: () => new Date("2026-09-07T10:00:00.000Z")
      }
    );

    expect(cleared).toBe(true);
    expect(schedulerCalled).toBe(false);
    expect(reply).toBeUndefined();
  });
});
