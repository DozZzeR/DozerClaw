export type ConversationTurnRole = "user" | "assistant";

export interface ConversationTurn {
  readonly chatId: string;
  readonly actorId?: string;
  readonly role: ConversationTurnRole;
  readonly text: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface AppendConversationTurnInput {
  readonly actorId?: string;
  readonly role: ConversationTurnRole;
  readonly text: string;
  readonly sourceMessageKey?: string;
}

export interface AppendConversationTurnsInput {
  readonly chatId: string;
  readonly turns: readonly AppendConversationTurnInput[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface ConversationTurnRepositoryPort {
  appendTurns(input: AppendConversationTurnsInput): Promise<void>;
  listRecentActiveByChatId(
    chatId: string,
    now: Date,
    limit: number
  ): Promise<readonly ConversationTurn[]>;
  clearByChatId(chatId: string): Promise<void>;
}
