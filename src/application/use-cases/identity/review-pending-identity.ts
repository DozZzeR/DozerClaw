import type { ActorStatus } from "../../../core/domain/identity/actor.js";
import type { IdentityAccessRepositoryPort } from "../../../ports/identity-access-repository-port.js";

export type PendingIdentityDecision = "approve" | "reject";

export interface ReviewPendingIdentityInput {
  readonly actorId: string;
  readonly decision: PendingIdentityDecision;
}

export type ReviewPendingIdentityResult =
  | {
      readonly reviewed: true;
      readonly actorStatus: ActorStatus;
      readonly identityStatus: ActorStatus;
      readonly chatApproved: boolean;
    }
  | {
      readonly reviewed: false;
    };

export class ReviewPendingIdentityUseCase {
  constructor(
    private readonly dependencies: {
      readonly repository: IdentityAccessRepositoryPort;
    }
  ) {}

  async execute(
    input: ReviewPendingIdentityInput
  ): Promise<ReviewPendingIdentityResult> {
    const request =
      await this.dependencies.repository.findPendingAccessRequestByActorId(
        input.actorId
      );

    if (!request) {
      return { reviewed: false };
    }

    const status: ActorStatus =
      input.decision === "approve" ? "active" : "blocked";
    const chatApproved = input.decision === "approve";

    await this.dependencies.repository.updateActorStatus(input.actorId, status);
    await this.dependencies.repository.updateActorIdentityStatus(
      request.identity.id,
      status
    );
    await this.dependencies.repository.updateMessengerChatApproval(
      request.chat.id,
      chatApproved
    );

    return {
      reviewed: true,
      actorStatus: status,
      identityStatus: status,
      chatApproved
    };
  }
}
