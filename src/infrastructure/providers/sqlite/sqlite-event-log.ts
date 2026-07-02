import type {
  EventLogHealth,
  EventLogPort,
  OperationalEvent
} from "../../../ports/event-log-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

export class SqliteEventLog implements EventLogPort {
  constructor(private readonly database: SqliteDatabase) {}

  async healthCheck(): Promise<EventLogHealth> {
    try {
      await this.record({
        type: "event_log.health_check",
        occurredAt: new Date(),
        attributes: {
          ok: true
        }
      });

      return {
        ok: true,
        detail: "Event log writable"
      };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : "Event log unavailable"
      };
    }
  }

  async record(event: OperationalEvent): Promise<void> {
    this.database
      .prepare(
        `
          insert into operational_events (type, occurred_at, attributes_json)
          values (@type, @occurredAt, @attributesJson)
        `
      )
      .run({
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        attributesJson: JSON.stringify(event.attributes ?? {})
      });
  }
}
