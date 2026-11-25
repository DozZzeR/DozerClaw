import { formatLocalDateTimeParts } from "../../../core/domain/calendar/calendar-event.js";
import type { MorningDigestRunResult } from "./send-morning-digest.js";

export interface MorningDigestRunner {
  executeScheduled(input?: {
    readonly now?: Date;
  }): Promise<MorningDigestRunResult>;
}

export interface MorningDigestSchedulerOptions {
  readonly runner: MorningDigestRunner;
  readonly timeZone: string;
  /** Local wall-clock HH:mm trigger time (default "08:00"). */
  readonly digestTime?: string;
  /** Local wall-clock HH:mm upper bound for catch-up after restarts (default "12:00"). */
  readonly catchUpUntil?: string;
  readonly pollIntervalMs?: number;
  readonly now?: () => Date;
  readonly onError?: (error: unknown) => void;
}

export class MorningDigestScheduler {
  private readonly digestTime: string;
  private readonly catchUpUntil: string;
  private readonly pollIntervalMs: number;
  private readonly now: () => Date;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight = false;

  constructor(private readonly options: MorningDigestSchedulerOptions) {
    this.digestTime = options.digestTime ?? "08:00";
    this.catchUpUntil = options.catchUpUntil ?? "12:00";
    this.pollIntervalMs = options.pollIntervalMs ?? 60_000;
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(): Promise<MorningDigestRunResult | undefined> {
    if (this.inFlight) {
      return undefined;
    }

    const current = this.now();
    const { time } = formatLocalDateTimeParts(current, this.options.timeZone);

    if (time < this.digestTime || time >= this.catchUpUntil) {
      return undefined;
    }

    this.inFlight = true;
    try {
      return await this.options.runner.executeScheduled({ now: current });
    } catch (error) {
      this.options.onError?.(error);
      return undefined;
    } finally {
      this.inFlight = false;
    }
  }
}
