import type { AdminSession } from "../../../core/domain/identity/admin-session.js";
import type { AccessAction, AccessDenialReason } from "../../../core/domain/identity/access-policy.js";
import { evaluateAccess } from "../../../core/domain/identity/access-policy.js";
import type { Actor } from "../../../core/domain/identity/actor.js";
import type { ChatContext, ChatContextKind } from "../../../core/domain/identity/chat-context.js";
import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type {
  ResolveIdentityContextInput,
  ResolveIdentityContextResult
} from "../identity/resolve-identity-context.js";
import type { IdentityAccessRepositoryPort } from "../../../ports/identity-access-repository-port.js";

export interface ProcessInboundMessageInput {
  readonly messageId: string;
  readonly provider: string;
  readonly providerUserId: string;
  readonly providerChatId: string;
  readonly chatKind: ChatContextKind;
  readonly displayName: string;
  readonly text: string;
  readonly attachments: readonly MessageAttachment[];
  readonly action: AccessAction;
  readonly receivedAt: Date;
  readonly now: Date;
  readonly adminSessionId?: string;
}

export type ProcessInboundMessageResult =
  | {
      readonly status: "pending_approval";
      readonly reply: MessagingReply;
    }
  | {
      readonly status: "denied";
      readonly reason: AccessDenialReason;
      readonly reply: MessagingReply;
    }
  | {
      readonly status: "accepted";
      readonly context: AcceptedMessageContext;
    };

export interface MessagingReply {
  readonly chatId: string;
  readonly text: string;
}

export interface AcceptedMessageContext {
  readonly actor: Actor;
  readonly chat: ChatContext;
  readonly action: AccessAction;
  readonly text: string;
  readonly attachments: readonly MessageAttachment[];
  readonly adminSession?: AdminSession;
}

export interface IdentityContextResolver {
  execute(input: ResolveIdentityContextInput): Promise<ResolveIdentityContextResult>;
}

export interface ProcessInboundMessageDependencies {
  readonly identityContextResolver: IdentityContextResolver;
  readonly identityRepository: Pick<
    IdentityAccessRepositoryPort,
    "findAdminSession"
  >;
}

export class ProcessInboundMessageUseCase {
  constructor(
    private readonly dependencies: ProcessInboundMessageDependencies
  ) {}

  async execute(
    input: ProcessInboundMessageInput
  ): Promise<ProcessInboundMessageResult> {
    const identityContext =
      await this.dependencies.identityContextResolver.execute({
        provider: input.provider,
        providerUserId: input.providerUserId,
        providerChatId: input.providerChatId,
        chatKind: input.chatKind,
        displayName: input.displayName
      });

    if (requiresApproval(identityContext)) {
      return {
        status: "pending_approval",
        reply: {
          chatId: identityContext.chat.id,
          text: "Access request is pending owner approval."
        }
      };
    }

    const adminSession = input.adminSessionId
      ? await this.dependencies.identityRepository.findAdminSession(
          input.adminSessionId
        )
      : undefined;

    const decision = evaluateAccess({
      actor: identityContext.actor,
      chat: identityContext.chat,
      action: input.action,
      ...(adminSession ? { adminSession } : {}),
      now: input.now
    });

    if (!decision.allowed) {
      return {
        status: "denied",
        reason: decision.reason,
        reply: {
          chatId: identityContext.chat.id,
          text: `Access denied: ${decision.reason}.`
        }
      };
    }

    return {
      status: "accepted",
      context: {
        actor: identityContext.actor,
        chat: identityContext.chat,
        action: input.action,
        text: input.text,
        attachments: input.attachments,
        ...(adminSession ? { adminSession } : {})
      }
    };
  }
}

function requiresApproval(context: ResolveIdentityContextResult): boolean {
  return (
    context.createdActor ||
    context.createdChat ||
    context.actor.status !== "active" ||
    !context.chat.approved
  );
}
