import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type {
  AdminSessionActivator,
  DispatchAcceptedCommandInput,
  PendingAccessRequestReviewer
} from "../dispatch-accepted-command.js";
import type { PendingIdentityDecision } from "../../identity/review-pending-identity.js";
import { parseActorId, parseAdminSecret } from "../dispatch-command-helpers.js";

export interface PendingAccessReviewDependencies {
  readonly reviewer?: PendingAccessRequestReviewer | undefined;
}

export async function handleListPendingAccessRequests(
  chatId: string,
  dependencies: PendingAccessReviewDependencies
): Promise<OutboundReply> {
  if (!dependencies.reviewer) {
    return {
      chatId,
      text: "Pending access review is not configured."
    };
  }

  const requests = await dependencies.reviewer.list();

  if (requests.length === 0) {
    return {
      chatId,
      text: "No pending access requests."
    };
  }

  return {
    chatId,
    text: [
      "Pending access requests:",
      ...requests.flatMap((request) => [
        `- ${request.actor.id}: ${request.actor.displayName} (${request.identity.provider} user ${request.identity.providerUserId}, chat ${request.chat.providerChatId}, ${request.chat.kind})`,
        `Approve: /approve ${request.actor.id}`,
        `Reject: /reject ${request.actor.id}`
      ])
    ].join("\n")
  };
}

export async function handleReviewPendingAccessRequest(
  input: DispatchAcceptedCommandInput,
  dependencies: PendingAccessReviewDependencies
): Promise<OutboundReply> {
  if (!dependencies.reviewer) {
    return {
      chatId: input.context.chat.id,
      text: "Pending access review is not configured."
    };
  }

  const actorId = parseActorId(input.route.normalizedText);

  if (!actorId) {
    return {
      chatId: input.context.chat.id,
      text: `Usage: /${input.route.kind === "approve_access_request" ? "approve" : "reject"} <actorId>.`
    };
  }

  const decision: PendingIdentityDecision =
    input.route.kind === "approve_access_request" ? "approve" : "reject";
  const result = await dependencies.reviewer.review({
    actorId,
    decision
  });

  if (!result.reviewed) {
    return {
      chatId: input.context.chat.id,
      text: `No pending access request found for ${actorId}.`
    };
  }

  return {
    chatId: input.context.chat.id,
    text:
      decision === "approve"
        ? `Approved access request for ${actorId}.`
        : `Rejected access request for ${actorId}.`
  };
}

export interface ActivateAdminSessionDependencies {
  readonly activator?: AdminSessionActivator | undefined;
  readonly now: () => Date;
}

export async function handleActivateAdminSession(
  input: DispatchAcceptedCommandInput,
  dependencies: ActivateAdminSessionDependencies
): Promise<OutboundReply> {
  if (!dependencies.activator) {
    return {
      chatId: input.context.chat.id,
      text: "Admin mode is not configured."
    };
  }

  const secret = parseAdminSecret(input.route.normalizedText);
  if (!secret) {
    return {
      chatId: input.context.chat.id,
      text: "Usage: /admin <secret>."
    };
  }

  const result = await dependencies.activator.execute({
    actor: input.context.actor,
    chat: input.context.chat,
    secret,
    now: dependencies.now()
  });

  if (!result.activated) {
    return {
      chatId: input.context.chat.id,
      text: `Admin mode not activated: ${result.reason}.`
    };
  }

  return {
    chatId: input.context.chat.id,
    text: `Admin mode activated until ${result.session.expiresAt.toISOString()}.`
  };
}
