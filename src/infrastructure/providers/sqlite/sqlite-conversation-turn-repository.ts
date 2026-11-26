import type {
  AppendConversationTurnsInput,
  ConversationTurn,
  ConversationTurnRepositoryPort,
  ConversationTurnRole
} from "../../../ports/conversation-turn-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

const DEFAULT_MAX_STORED_TURNS_PER_CHAT = 20;

interface ConversationTurnRow {
  readonly chat_id: string;
  readonly actor_id: string | null;
  readonly role: ConversationTurnRole;
  readonly text: string;
  readonly created_at: string;
  readonly expires_at: string;
}

export class SqliteConversationTurnRepository
  implements ConversationTurnRepositoryPort
{
  private readonly maxStoredTurnsPerChat: number;

  constructor(
    private readonly database: SqliteDatabase,
    options: { readonly maxStoredTurnsPerChat?: number } = {}
  ) {
    this.maxStoredTurnsPerChat =
      options.maxStoredTurnsPerChat ?? DEFAULT_MAX_STORED_TURNS_PER_CHAT;
  }

  async appendTurns(input: AppendConversationTurnsInput): Promise<void> {
    if (input.turns.length === 0) {
      return;
    }

    const createdAtIso = input.createdAt.toISOString();
    const expiresAtIso = input.expiresAt.toISOString();

    const transaction = this.database.transaction(() => {
      const insert = this.database.prepare(
        `
          insert or ignore into chat_conversation_turns (
            chat_id,
            actor_id,
            role,
            text,
            source_message_key,
            created_at,
            expires_at
          ) values (?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const turn of input.turns) {
        const trimmed = turn.text.trim();
        if (!trimmed) {
          continue;
        }

        insert.run(
          input.chatId,
          turn.actorId ?? null,
          turn.role,
          trimmed,
          turn.sourceMessageKey ?? null,
          createdAtIso,
          expiresAtIso
        );
      }

      this.database
        .prepare(
          `
            delete from chat_conversation_turns
            where chat_id = ? and expires_at < ?
          `
        )
        .run(input.chatId, createdAtIso);

      this.database
        .prepare(
          `
            delete from chat_conversation_turns
            where chat_id = ?
              and id not in (
                select id
                from chat_conversation_turns
                where chat_id = ?
                order by id desc
                limit ?
              )
          `
        )
        .run(input.chatId, input.chatId, this.maxStoredTurnsPerChat);
    });

    transaction();
  }

  async listRecentActiveByChatId(
    chatId: string,
    now: Date,
    limit: number
  ): Promise<readonly ConversationTurn[]> {
    if (limit <= 0) {
      return [];
    }

    const rows = this.database
      .prepare(
        `
          select chat_id, actor_id, role, text, created_at, expires_at
          from chat_conversation_turns
          where chat_id = ? and expires_at >= ?
          order by id desc
          limit ?
        `
      )
      .all(chatId, now.toISOString(), limit) as readonly ConversationTurnRow[];

    return [...rows].reverse().map((row) => ({
      chatId: row.chat_id,
      ...(row.actor_id ? { actorId: row.actor_id } : {}),
      role: row.role,
      text: row.text,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at)
    }));
  }

  async clearByChatId(chatId: string): Promise<void> {
    this.database
      .prepare("delete from chat_conversation_turns where chat_id = ?")
      .run(chatId);
  }
}
