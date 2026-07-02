import type { AdminSession } from "../../../core/domain/identity/admin-session.js";
import type { Actor, ActorRole, ActorStatus } from "../../../core/domain/identity/actor.js";
import type { ActorIdentity } from "../../../core/domain/identity/actor-identity.js";
import type {
  ChatContext,
  ChatContextKind
} from "../../../core/domain/identity/chat-context.js";
import type { MessengerChat } from "../../../core/domain/identity/messenger-chat.js";
import type { IdentityAccessRepositoryPort } from "../../../ports/identity-access-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

export class SqliteIdentityAccessRepository
  implements IdentityAccessRepositoryPort
{
  constructor(private readonly database: SqliteDatabase) {}

  async createActor(actor: Actor): Promise<Actor> {
    this.database
      .prepare(
        `
          insert into actors (id, display_name, role, status)
          values (@id, @displayName, @role, @status)
        `
      )
      .run(actor);

    return actor;
  }

  async createActorIdentity(
    identity: ActorIdentity
  ): Promise<ActorIdentity> {
    this.database
      .prepare(
        `
          insert into actor_identities (
            id,
            actor_id,
            provider,
            provider_user_id,
            status
          )
          values (
            @id,
            @actorId,
            @provider,
            @providerUserId,
            @status
          )
        `
      )
      .run(identity);

    return identity;
  }

  async createMessengerChat(chat: MessengerChat): Promise<MessengerChat> {
    this.database
      .prepare(
        `
          insert into messenger_chats (
            id,
            provider,
            provider_chat_id,
            kind,
            approved
          )
          values (
            @id,
            @provider,
            @providerChatId,
            @kind,
            @approved
          )
        `
      )
      .run({
        ...chat,
        approved: chat.approved ? 1 : 0
      });

    return chat;
  }

  async saveAdminSession(session: AdminSession): Promise<AdminSession> {
    this.database
      .prepare(
        `
          insert into admin_sessions (
            id,
            actor_id,
            chat_id,
            last_activity_at,
            expires_at
          )
          values (
            @id,
            @actorId,
            @chatId,
            @lastActivityAt,
            @expiresAt
          )
          on conflict(id) do update set
            actor_id = excluded.actor_id,
            chat_id = excluded.chat_id,
            last_activity_at = excluded.last_activity_at,
            expires_at = excluded.expires_at
        `
      )
      .run({
        id: session.id,
        actorId: session.actorId,
        chatId: session.chatId,
        lastActivityAt: session.lastActivityAt.toISOString(),
        expiresAt: session.expiresAt.toISOString()
      });

    return session;
  }

  async updateActorStatus(
    actorId: string,
    status: ActorStatus
  ): Promise<void> {
    this.database
      .prepare(
        `
          update actors
          set status = @status
          where id = @actorId
        `
      )
      .run({ actorId, status });
  }

  async updateActorIdentityStatus(
    identityId: string,
    status: ActorStatus
  ): Promise<void> {
    this.database
      .prepare(
        `
          update actor_identities
          set status = @status
          where id = @identityId
        `
      )
      .run({ identityId, status });
  }

  async findActorByIdentity(
    provider: string,
    providerUserId: string
  ): Promise<Actor | undefined> {
    const row = this.database
      .prepare(
        `
          select
            actors.id,
            actors.display_name,
            actors.role,
            actors.status
          from actors
          inner join actor_identities
            on actor_identities.actor_id = actors.id
          where actor_identities.provider = @provider
            and actor_identities.provider_user_id = @providerUserId
          limit 1
        `
      )
      .get({ provider, providerUserId }) as ActorRow | undefined;

    return row ? actorFromRow(row) : undefined;
  }

  async findChatByProviderChatId(
    provider: string,
    providerChatId: string
  ): Promise<ChatContext | undefined> {
    const row = this.database
      .prepare(
        `
          select id, kind, approved
          from messenger_chats
          where provider = @provider
            and provider_chat_id = @providerChatId
          limit 1
        `
      )
      .get({ provider, providerChatId }) as ChatRow | undefined;

    return row ? chatFromRow(row) : undefined;
  }

  async findAdminSession(id: string): Promise<AdminSession | undefined> {
    const row = this.database
      .prepare(
        `
          select id, actor_id, chat_id, last_activity_at, expires_at
          from admin_sessions
          where id = @id
          limit 1
        `
      )
      .get({ id }) as AdminSessionRow | undefined;

    return row ? adminSessionFromRow(row) : undefined;
  }
}

interface ActorRow {
  readonly id: string;
  readonly display_name: string;
  readonly role: ActorRole;
  readonly status: ActorStatus;
}

interface ChatRow {
  readonly id: string;
  readonly kind: ChatContextKind;
  readonly approved: 0 | 1;
}

interface AdminSessionRow {
  readonly id: string;
  readonly actor_id: string;
  readonly chat_id: string;
  readonly last_activity_at: string;
  readonly expires_at: string;
}

function actorFromRow(row: ActorRow): Actor {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    status: row.status
  };
}

function chatFromRow(row: ChatRow): ChatContext {
  return {
    id: row.id,
    kind: row.kind,
    approved: row.approved === 1
  };
}

function adminSessionFromRow(row: AdminSessionRow): AdminSession {
  return {
    id: row.id,
    actorId: row.actor_id,
    chatId: row.chat_id,
    lastActivityAt: new Date(row.last_activity_at),
    expiresAt: new Date(row.expires_at)
  };
}
