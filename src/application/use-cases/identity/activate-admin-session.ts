import { createAdminSession } from "../../../core/domain/identity/admin-session.js";
import type { AdminSession } from "../../../core/domain/identity/admin-session.js";
import { evaluateAccess } from "../../../core/domain/identity/access-policy.js";
import type { AccessDenialReason } from "../../../core/domain/identity/access-policy.js";
import type { Actor } from "../../../core/domain/identity/actor.js";
import type { ChatContext } from "../../../core/domain/identity/chat-context.js";
import type { AdminSecretVerifierPort } from "../../../ports/admin-secret-verifier-port.js";
import type { IdentityAccessRepositoryPort } from "../../../ports/identity-access-repository-port.js";

export interface ActivateAdminSessionInput {
  readonly actor: Actor;
  readonly chat: ChatContext;
  readonly secret: string;
  readonly now: Date;
}

export type ActivateAdminSessionResult =
  | { readonly activated: true; readonly session: AdminSession }
  | {
      readonly activated: false;
      readonly reason: AccessDenialReason | "invalid_secret";
    };

export interface ActivateAdminSessionDependencies {
  readonly repository: IdentityAccessRepositoryPort;
  readonly verifier: AdminSecretVerifierPort;
  readonly generateId: () => string;
  readonly ttlMs: number;
}

export class ActivateAdminSessionUseCase {
  constructor(private readonly dependencies: ActivateAdminSessionDependencies) {}

  async execute(
    input: ActivateAdminSessionInput
  ): Promise<ActivateAdminSessionResult> {
    const policy = evaluateAccess({
      actor: input.actor,
      chat: input.chat,
      action: "owner_read",
      now: input.now
    });

    if (!policy.allowed) {
      return {
        activated: false,
        reason: policy.reason
      };
    }

    const validSecret = await this.dependencies.verifier.verifyAdminSecret(
      input.secret
    );

    if (!validSecret) {
      return {
        activated: false,
        reason: "invalid_secret"
      };
    }

    const session = createAdminSession({
      id: this.dependencies.generateId(),
      actorId: input.actor.id,
      chatId: input.chat.id,
      now: input.now,
      ttlMs: this.dependencies.ttlMs
    });

    await this.dependencies.repository.saveAdminSession(session);

    return {
      activated: true,
      session
    };
  }
}
