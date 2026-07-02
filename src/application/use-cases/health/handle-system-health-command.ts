import type { HostHealthSnapshot } from "../../../ports/server-monitor-port.js";
import type { OutboundReply } from "../../../core/domain/messaging/reply.js";

export interface HostHealthSource {
  execute(): Promise<HostHealthSnapshot>;
}

export interface HandleSystemHealthCommandDependencies {
  readonly getHostHealth: HostHealthSource;
}

export interface HandleSystemHealthCommandInput {
  readonly chatId: string;
}

export class HandleSystemHealthCommandUseCase {
  constructor(
    private readonly dependencies: HandleSystemHealthCommandDependencies
  ) {}

  async execute(input: HandleSystemHealthCommandInput): Promise<OutboundReply> {
    const snapshot = await this.dependencies.getHostHealth.execute();

    return {
      chatId: input.chatId,
      text: formatHostHealth(snapshot)
    };
  }
}

function formatHostHealth(snapshot: HostHealthSnapshot): string {
  const freePercent =
    snapshot.memory.totalBytes > 0
      ? (snapshot.memory.freeBytes / snapshot.memory.totalBytes) * 100
      : 0;

  return [
    "System health:",
    `Uptime: ${formatDuration(snapshot.uptimeSeconds)}`,
    `Load average: ${snapshot.loadAverage
      .map((value) => value.toFixed(2))
      .join(", ")}`,
    `Memory: ${formatBytes(snapshot.memory.freeBytes)} free / ${formatBytes(
      snapshot.memory.totalBytes
    )} total (${freePercent.toFixed(1)}% free)`,
    `Checked at: ${snapshot.checkedAt.toISOString()}`
  ].join("\n");
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  return `${hours}h ${minutes}m ${seconds}s`;
}

function formatBytes(bytes: number): string {
  return `${bytes} B`;
}
