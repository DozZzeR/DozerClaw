export interface DigestRunRepositoryPort {
  /**
   * Atomically reserve a digest run for (digestKey, localDate).
   * Returns true if this caller acquired the reservation, false if already
   * reserved or sent.
   */
  tryReserveRun(
    digestKey: string,
    localDate: string,
    reservedAt: Date
  ): Promise<boolean>;
  markSent(digestKey: string, localDate: string, sentAt: Date): Promise<void>;
  releaseReservation(digestKey: string, localDate: string): Promise<void>;
  hasSentRun(digestKey: string, localDate: string): Promise<boolean>;
}
