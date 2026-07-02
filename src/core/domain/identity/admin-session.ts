export interface AdminSession {
  readonly id: string;
  readonly actorId: string;
  readonly chatId: string;
  readonly lastActivityAt: Date;
  readonly expiresAt: Date;
}

export interface CreateAdminSessionInput {
  readonly id: string;
  readonly actorId: string;
  readonly chatId: string;
  readonly now: Date;
  readonly ttlMs: number;
}

export function createAdminSession(input: CreateAdminSessionInput): AdminSession {
  return {
    id: input.id,
    actorId: input.actorId,
    chatId: input.chatId,
    lastActivityAt: input.now,
    expiresAt: addMilliseconds(input.now, input.ttlMs)
  };
}

export function isAdminSessionActive(
  session: AdminSession | undefined,
  now: Date
): boolean {
  if (!session) {
    return false;
  }

  return session.expiresAt.getTime() > now.getTime();
}

export interface RefreshAdminSessionInput {
  readonly session: AdminSession;
  readonly now: Date;
  readonly ttlMs: number;
}

export function refreshAdminSession(
  input: RefreshAdminSessionInput
): AdminSession {
  return {
    ...input.session,
    lastActivityAt: input.now,
    expiresAt: addMilliseconds(input.now, input.ttlMs)
  };
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}
