import type { ActorStatus } from "./actor.js";

export interface ActorIdentity {
  readonly id: string;
  readonly actorId: string;
  readonly provider: string;
  readonly providerUserId: string;
  readonly status: ActorStatus;
}
