import type { DigestRunRepositoryPort } from "../../../ports/digest-run-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

export class SqliteDigestRunRepository implements DigestRunRepositoryPort {
  constructor(private readonly database: SqliteDatabase) {}

  async tryReserveRun(
    digestKey: string,
    localDate: string,
    reservedAt: Date
  ): Promise<boolean> {
    const result = this.database
      .prepare(
        `
          insert or ignore into scheduled_digest_runs (
            digest_key,
            local_date,
            status,
            reserved_at
          )
          values (?, ?, 'reserved', ?)
        `
      )
      .run(digestKey, localDate, reservedAt.toISOString());

    return result.changes === 1;
  }

  async markSent(
    digestKey: string,
    localDate: string,
    sentAt: Date
  ): Promise<void> {
    this.database
      .prepare(
        `
          update scheduled_digest_runs
          set status = 'sent', sent_at = ?
          where digest_key = ? and local_date = ?
        `
      )
      .run(sentAt.toISOString(), digestKey, localDate);
  }

  async releaseReservation(
    digestKey: string,
    localDate: string
  ): Promise<void> {
    this.database
      .prepare(
        `
          delete from scheduled_digest_runs
          where digest_key = ? and local_date = ? and status = 'reserved'
        `
      )
      .run(digestKey, localDate);
  }

  async hasSentRun(digestKey: string, localDate: string): Promise<boolean> {
    const row = this.database
      .prepare(
        `
          select 1 as found
          from scheduled_digest_runs
          where digest_key = ? and local_date = ? and status = 'sent'
        `
      )
      .get(digestKey, localDate) as { readonly found: number } | undefined;

    return Boolean(row?.found);
  }
}
