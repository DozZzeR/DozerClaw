export type ActorRole = "owner" | "family";

export type ActorStatus = "pending" | "active" | "blocked";

export interface Actor {
  readonly id: string;
  readonly displayName: string;
  readonly role: ActorRole;
  readonly status: ActorStatus;
}
