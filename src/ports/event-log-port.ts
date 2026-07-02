export interface EventLogPort {
  healthCheck(): Promise<EventLogHealth>;
  record(event: OperationalEvent): Promise<void>;
}

export interface EventLogHealth {
  readonly ok: boolean;
  readonly detail?: string;
}

export interface OperationalEvent {
  readonly type: string;
  readonly occurredAt: Date;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}
