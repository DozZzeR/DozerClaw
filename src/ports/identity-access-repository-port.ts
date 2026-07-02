import type { AdminSession } from "../core/domain/identity/admin-session.js";
import type { Actor } from "../core/domain/identity/actor.js";
import type { ActorIdentity } from "../core/domain/identity/actor-identity.js";
import type { ChatContext } from "../core/domain/identity/chat-context.js";
import type { MessengerChat } from "../core/domain/identity/messenger-chat.js";

export interface IdentityAccessRepositoryPort {
  createActor(actor: Actor): Promise<Actor>;
  createActorIdentity(identity: ActorIdentity): Promise<ActorIdentity>;
  createMessengerChat(chat: MessengerChat): Promise<MessengerChat>;
  saveAdminSession(session: AdminSession): Promise<AdminSession>;
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
