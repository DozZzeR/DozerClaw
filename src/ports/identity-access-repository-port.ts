import type { AdminSession } from "../core/domain/identity/admin-session.js";
import type { Actor, ActorStatus } from "../core/domain/identity/actor.js";
import type {
  ActorIdentity
} from "../core/domain/identity/actor-identity.js";
import type { ChatContext } from "../core/domain/identity/chat-context.js";
import type { MessengerChat } from "../core/domain/identity/messenger-chat.js";

export interface PendingAccessRequest {
  readonly actor: Actor;
  readonly identity: Pick<
    ActorIdentity,
    "id" | "provider" | "providerUserId" | "status"
  >;
  readonly chat: MessengerChat;
}

export interface IdentityAccessRepositoryPort {
  createActor(actor: Actor): Promise<Actor>;
  createActorIdentity(identity: ActorIdentity): Promise<ActorIdentity>;
  createMessengerChat(chat: MessengerChat): Promise<MessengerChat>;
  saveAdminSession(session: AdminSession): Promise<AdminSession>;
  updateActorStatus(actorId: string, status: ActorStatus): Promise<void>;
  updateActorIdentityStatus(
    identityId: string,
    status: ActorStatus
  ): Promise<void>;
  updateMessengerChatApproval(chatId: string, approved: boolean): Promise<void>;
  listPendingAccessRequests(): Promise<readonly PendingAccessRequest[]>;
  findPendingAccessRequestByActorId(
    actorId: string
  ): Promise<PendingAccessRequest | undefined>;
  findActorByIdentity(
    provider: string,
    providerUserId: string
  ): Promise<Actor | undefined>;
  findChatByProviderChatId(
    provider: string,
    providerChatId: string
  ): Promise<ChatContext | undefined>;
  findAdminSession(id: string): Promise<AdminSession | undefined>;
}
