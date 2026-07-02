export interface EventLogPort {
  record(event: OperationalEvent): Promise<void>;
}

export interface OperationalEvent {
  readonly type: string;
  readonly occurredAt: Date;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}
