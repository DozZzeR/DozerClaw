import type { AdminSession } from "../../../core/domain/identity/admin-session.js";
import { refreshAdminSession } from "../../../core/domain/identity/admin-session.js";
import { evaluateAccess } from "../../../core/domain/identity/access-policy.js";
import type { AccessDenialReason } from "../../../core/domain/identity/access-policy.js";
import type { Actor } from "../../../core/domain/identity/actor.js";
import type { ChatContext } from "../../../core/domain/identity/chat-context.js";
import type { IdentityAccessRepositoryPort } from "../../../ports/identity-access-repository-port.js";

export interface RefreshAdminSessionInput {
  readonly sessionId: string;
  readonly actor: Actor;
  readonly chat: ChatContext;
  readonly now: Date;
}

export type RefreshAdminSessionResult =
  | { readonly refreshed: true; readonly session: AdminSession }
  | {
      readonly refreshed: false;
      readonly reason: AccessDenialReason | "admin_session_not_found";
    };

export class RefreshAdminSessionUseCase {
  constructor(
    private readonly dependencies: {
      readonly repository: IdentityAccessRepositoryPort;
      readonly ttlMs: number;
    }
  ) {}

  async execute(
    input: RefreshAdminSessionInput
  ): Promise<RefreshAdminSessionResult> {
    const session = await this.dependencies.repository.findAdminSession(
      input.sessionId
    );

    if (!session) {
      return {
        refreshed: false,
        reason: "admin_session_not_found"
      };
    }

    const policy = evaluateAccess({
      actor: input.actor,
      chat: input.chat,
      action: "admin_write",
      adminSession: session,
      now: input.now
    });

    if (!policy.allowed) {
      return {
        refreshed: false,
        reason: policy.reason
      };
    }

    const refreshed = refreshAdminSession({
      session,
      now: input.now,
      ttlMs: this.dependencies.ttlMs
    });

    await this.dependencies.repository.saveAdminSession(refreshed);

    return {
      refreshed: true,
      session: refreshed
    };
  }
}
