import type { AdminSession } from "./admin-session.js";
import { isAdminSessionActive } from "./admin-session.js";
import type { Actor } from "./actor.js";
import type { ChatContext } from "./chat-context.js";

export type AccessAction =
  | "family_read"
  | "family_write"
  | "owner_read"
  | "admin_write";

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: AccessDenialReason };

export type AccessDenialReason =
  | "actor_inactive"
  | "chat_unapproved"
  | "owner_required"
  | "owner_private_chat_required"
  | "admin_session_required";

export interface EvaluateAccessInput {
  readonly actor: Actor;
  readonly chat: ChatContext;
  readonly action: AccessAction;
  readonly adminSession?: AdminSession;
  readonly now: Date;
}

export function evaluateAccess(input: EvaluateAccessInput): AccessDecision {
  if (input.actor.status !== "active") {
    return deny("actor_inactive");
  }

  if (!input.chat.approved) {
    return deny("chat_unapproved");
  }

  if (input.chat.kind === "owner_private" && input.actor.role !== "owner") {
    return deny("owner_required");
  }

  if (input.action === "family_read" || input.action === "family_write") {
    return { allowed: true };
  }

  if (input.actor.role !== "owner") {
    return deny("owner_required");
  }

  if (input.chat.kind !== "owner_private") {
    return deny("owner_private_chat_required");
  }

  if (input.action === "owner_read") {
    return { allowed: true };
  }

  if (!isMatchingActiveAdminSession(input)) {
    return deny("admin_session_required");
  }

  return { allowed: true };
}

function isMatchingActiveAdminSession(input: EvaluateAccessInput): boolean {
  return (
    input.adminSession?.actorId === input.actor.id &&
    input.adminSession.chatId === input.chat.id &&
    isAdminSessionActive(input.adminSession, input.now)
  );
}

function deny(reason: AccessDenialReason): AccessDecision {
  return { allowed: false, reason };
}
