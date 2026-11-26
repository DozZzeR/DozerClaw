import { formatLocalDateTimeParts } from "../../../../core/domain/calendar/calendar-event.js";
import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { PendingEventScheduleDecision } from "../../../../ports/state-repository-port.js";
import type { ScheduleEventUseCase } from "../../calendar/schedule-event.js";
import { nextPlanningCalendarDate } from "../../planning/planning-calendar-date.js";
import type {
  ConversationTurnPromptItem,
  InboundIntentClassifier
} from "../classify-inbound-intent.js";
import { pendingActorDeniedReply } from "../dispatch-command-helpers.js";
import type { PendingEventScheduleDecisionStore } from "../intent-handlers/calendar-intents.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export interface PendingEventScheduleDependencies {
  readonly eventScheduler?: Pick<ScheduleEventUseCase, "execute"> | undefined;
  readonly intentClassifier?: InboundIntentClassifier | undefined;
  readonly recentTurns?: readonly ConversationTurnPromptItem[] | undefined;
  readonly store: PendingEventScheduleDecisionStore;
  readonly timeZone: string;
  readonly now: () => Date;
}

export async function handlePendingEventScheduleDecision(
  context: AcceptedMessageContext,
  pending: PendingEventScheduleDecision,
  dependencies: PendingEventScheduleDependencies
): Promise<OutboundReply | undefined> {
  const deniedReply = pendingActorDeniedReply(context, pending);
  if (deniedReply) {
    return deniedReply;
  }

  if (context.actor.role !== "owner" || context.chat.kind !== "owner_private") {
    return {
      chatId: context.chat.id,
      text: "Личный календарь доступен только владельцу в личном чате."
    };
  }

  if (isCancelReply(context.text)) {
    await dependencies.store.clearByChatId(context.chat.id);
    return {
      chatId: context.chat.id,
      text: "Ок, не добавляю событие."
    };
  }

  if (!dependencies.eventScheduler) {
    return {
      chatId: context.chat.id,
      text: "Календарь и планирование событий сейчас не подключены."
    };
  }

  const now = dependencies.now();
  const deterministic = parseDeterministicScheduleReply(
    context.text,
    now,
    dependencies.timeZone
  );

  let date = deterministic.date ?? pending.date;
  let startTime = deterministic.startTime ?? pending.startTime;
  let title = pending.title ?? deterministic.title;
  let durationMinutes = pending.durationMinutes;
  let notes = pending.notes;
  let scope = pending.scope;

  // Use the model when deterministic parsing did not resolve both date & time
  // (or did not resolve either, to detect whether the user switched topics).
  if (dependencies.intentClassifier && (!date || !startTime || !title)) {
    const localParts = formatLocalDateTimeParts(now, dependencies.timeZone);
    try {
      const intent = await dependencies.intentClassifier.execute({
        text: buildFollowupClassifierText(pending, context.text),
        attachments: [],
        ...(dependencies.recentTurns && dependencies.recentTurns.length > 0
          ? { recentTurns: dependencies.recentTurns }
          : {}),
        currentLocalDateTime: `${localParts.offsetIso} (${localParts.weekday})`,
        timeZone: dependencies.timeZone
      });

      if (intent.kind === "schedule_event") {
        date = intent.date ?? date;
        startTime = intent.startTime ?? startTime;
        title = intent.title ?? title;
        durationMinutes = intent.durationMinutes ?? durationMinutes;
        notes = intent.notes ?? notes;
        scope = intent.scope ?? scope;
      } else if (
        !deterministic.date &&
        !deterministic.startTime &&
        intent.kind !== "ask_clarification" &&
        intent.kind !== "unsupported"
      ) {
        // User switched to an unrelated command (e.g. "купи молоко"); release
        // the pending schedule draft and let normal routing handle it.
        await dependencies.store.clearByChatId(context.chat.id);
        return undefined;
      }
    } catch {
      // Keep pending context intact if the model is temporarily unavailable.
    }
  }

  const result = await dependencies.eventScheduler.execute({
    text: `${pending.originalText}\n${context.text}`,
    ...(title ? { title } : {}),
    ...(date ? { date } : {}),
    ...(startTime ? { startTime } : {}),
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    ...(pending.url ? { url: pending.url } : {}),
    ...(notes ? { notes } : {}),
    ...(scope ? { scope } : {}),
    now
  });

  if (result.status === "needs_clarification") {
    await dependencies.store.save({
      chatId: context.chat.id,
      actorId: context.actor.id,
      ...result.draft,
      ...(pending.url && !result.draft.url ? { url: pending.url } : {}),
      createdAt: now,
      expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS)
    });

    return {
      chatId: context.chat.id,
      text: result.question
    };
  }

  await dependencies.store.clearByChatId(context.chat.id);

  return {
    chatId: context.chat.id,
    text: result.text
  };
}

function isCancelReply(text: string): boolean {
  return /^(?:отмена|отмени|не надо|cancel|stop|нет)$/iu.test(text.trim());
}

function parseDeterministicScheduleReply(
  text: string,
  now: Date,
  timeZone: string
): {
  readonly date?: string;
  readonly startTime?: string;
  readonly title?: string;
} {
  let remaining = text.trim();
  let date: string | undefined;
  let startTime: string | undefined;

  const isoDateMatch = /\b(\d{4}-\d{2}-\d{2})\b/.exec(remaining);
  if (isoDateMatch?.[1]) {
    date = isoDateMatch[1];
    remaining = remaining.replace(isoDateMatch[0], " ");
  } else if (/(?:^|\s)(?:сегодня|today)(?=\s|,|$)/iu.test(remaining)) {
    date = formatLocalDateTimeParts(now, timeZone).date;
    remaining = remaining.replace(/(?:^|\s)(?:сегодня|today)(?=\s|,|$)/iu, " ");
  } else if (/(?:^|\s)(?:завтра|tomorrow)(?=\s|,|$)/iu.test(remaining)) {
    date = nextPlanningCalendarDate(now, timeZone);
    remaining = remaining.replace(/(?:^|\s)(?:завтра|tomorrow)(?=\s|,|$)/iu, " ");
  } else if (/(?:^|\s)послезавтра(?=\s|,|$)/iu.test(remaining)) {
    const tomorrow = nextPlanningCalendarDate(now, timeZone);
    const tomorrowInstant = new Date(`${tomorrow}T12:00:00.000Z`);
    date = nextPlanningCalendarDate(tomorrowInstant, "UTC");
    remaining = remaining.replace(/(?:^|\s)послезавтра(?=\s|,|$)/iu, " ");
  }

  const timeMatch = /(?:(?:^|\s)(?:в|at)\s+)?\b([01]?\d|2[0-3]):([0-5]\d)\b/iu.exec(
    remaining
  );
  if (timeMatch?.[1] && timeMatch[2]) {
    startTime = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
    remaining = remaining.replace(timeMatch[0], " ");
  }

  const cleanedTitle = remaining
    .replace(/^[\s,.\-—–:]+|[\s,.\-—–:]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

  return {
    ...(date ? { date } : {}),
    ...(startTime ? { startTime } : {}),
    ...(cleanedTitle.length >= 2 ? { title: cleanedTitle } : {})
  };
}

function buildFollowupClassifierText(
  pending: PendingEventScheduleDecision,
  reply: string
): string {
  return [
    "Pending event scheduling follow-up.",
    `Original message: ${pending.originalText}`,
    ...(pending.url ? [`Event URL: ${pending.url}`] : []),
    ...(pending.title ? [`Known title: ${pending.title}`] : []),
    ...(pending.date ? [`Known date: ${pending.date}`] : []),
    ...(pending.startTime ? [`Known startTime: ${pending.startTime}`] : []),
    `User reply: ${reply}`
  ].join("\n");
}
