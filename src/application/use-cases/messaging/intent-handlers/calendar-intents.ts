import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { PendingEventScheduleDecision } from "../../../../ports/state-repository-port.js";
import type { ScheduleEventUseCase } from "../../calendar/schedule-event.js";
import type { SendMorningDigestUseCase } from "../../calendar/send-morning-digest.js";
import type { InboundIntent } from "../classify-inbound-intent.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export interface PendingEventScheduleDecisionStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingEventScheduleDecision | undefined>;
  save(input: PendingEventScheduleDecision): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface ScheduleEventHandlerDependencies {
  readonly eventScheduler?: Pick<ScheduleEventUseCase, "execute"> | undefined;
  readonly pendingEventScheduleDecisions?:
    | PendingEventScheduleDecisionStore
    | undefined;
  readonly now: () => Date;
}

export interface MorningDigestCommandDependencies {
  readonly morningDigest?: Pick<SendMorningDigestUseCase, "buildDigest"> | undefined;
  readonly now: () => Date;
}

export async function handleScheduleEvent(
  context: AcceptedMessageContext,
  intent: Extract<InboundIntent, { readonly kind: "schedule_event" }>,
  dependencies: ScheduleEventHandlerDependencies
): Promise<OutboundReply> {
  if (context.actor.role !== "owner" || context.chat.kind !== "owner_private") {
    return {
      chatId: context.chat.id,
      text: "Личный календарь доступен только владельцу в личном чате."
    };
  }

  if (!dependencies.eventScheduler) {
    return {
      chatId: context.chat.id,
      text: "Календарь и планирование событий сейчас не подключены."
    };
  }

  const now = dependencies.now();
  const result = await dependencies.eventScheduler.execute({
    text: context.text,
    ...(intent.title ? { title: intent.title } : {}),
    ...(intent.date ? { date: intent.date } : {}),
    ...(intent.startTime ? { startTime: intent.startTime } : {}),
    ...(intent.durationMinutes !== undefined
      ? { durationMinutes: intent.durationMinutes }
      : {}),
    ...(intent.url ? { url: intent.url } : {}),
    ...(intent.notes ? { notes: intent.notes } : {}),
    ...(intent.scope ? { scope: intent.scope } : {}),
    now
  });

  if (result.status === "needs_clarification") {
    await dependencies.pendingEventScheduleDecisions?.save({
      chatId: context.chat.id,
      actorId: context.actor.id,
      ...result.draft,
      createdAt: now,
      expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS)
    });

    return {
      chatId: context.chat.id,
      text: result.question
    };
  }

  await dependencies.pendingEventScheduleDecisions?.clearByChatId(
    context.chat.id
  );

  return {
    chatId: context.chat.id,
    text: result.text
  };
}

export async function handleMorningDigestCommand(
  context: AcceptedMessageContext,
  dependencies: MorningDigestCommandDependencies
): Promise<OutboundReply> {
  if (context.actor.role !== "owner" || context.chat.kind !== "owner_private") {
    return {
      chatId: context.chat.id,
      text: "Дайджест доступен только владельцу в личном чате."
    };
  }

  if (!dependencies.morningDigest) {
    return {
      chatId: context.chat.id,
      text: "Утренний дайджест сейчас не настроен."
    };
  }

  const digest = await dependencies.morningDigest.buildDigest(dependencies.now());

  return {
    chatId: context.chat.id,
    text: digest.text
  };
}
