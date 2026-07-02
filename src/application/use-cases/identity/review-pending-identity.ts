import type { ActorStatus } from "../../../core/domain/identity/actor.js";
import type { IdentityAccessRepositoryPort } from "../../../ports/identity-access-repository-port.js";

export type PendingIdentityDecision = "approve" | "reject";

export interface ReviewPendingIdentityInput {
  readonly actorId: string;
  readonly identityId: string;
  readonly decision: PendingIdentityDecision;
}

export interface ReviewPendingIdentityResult {
  readonly actorStatus: ActorStatus;
  readonly identityStatus: ActorStatus;
}

export class ReviewPendingIdentityUseCase {
  constructor(
    private readonly dependencies: {
      readonly repository: IdentityAccessRepositoryPort;
    }
  ) {}

  async execute(
    input: ReviewPendingIdentityInput
  ): Promise<ReviewPendingIdentityResult> {
    const status: ActorStatus =
      input.decision === "approve" ? "active" : "blocked";

    await this.dependencies.repository.updateActorStatus(input.actorId, status);
    await this.dependencies.repository.updateActorIdentityStatus(
      input.identityId,
      status
    );

    return {
      actorStatus: status,
      identityStatus: status
    };
  }
}
