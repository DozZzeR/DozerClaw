import type { HostHealthSnapshot } from "../../../ports/server-monitor-port.js";
import type { ServiceHealthSnapshot } from "../../../ports/service-monitor-port.js";
import type { OutboundReply } from "../../../core/domain/messaging/reply.js";

export interface HostHealthSource {
  execute(): Promise<HostHealthSnapshot>;
}

export interface ServiceHealthSource {
  execute(): Promise<readonly ServiceHealthSnapshot[]>;
}

export interface HandleSystemHealthCommandDependencies {
  readonly getHostHealth: HostHealthSource;
  readonly getServiceHealth: ServiceHealthSource;
}

export interface HandleSystemHealthCommandInput {
  readonly chatId: string;
}

export class HandleSystemHealthCommandUseCase {
  constructor(
    private readonly dependencies: HandleSystemHealthCommandDependencies
  ) {}

  async execute(input: HandleSystemHealthCommandInput): Promise<OutboundReply> {
    const [hostSnapshot, serviceSnapshots] = await Promise.all([
      this.dependencies.getHostHealth.execute(),
      this.dependencies.getServiceHealth.execute()
    ]);

    return {
      chatId: input.chatId,
      text: formatSystemHealth(hostSnapshot, serviceSnapshots)
    };
  }
}

function formatSystemHealth(
  hostSnapshot: HostHealthSnapshot,
  serviceSnapshots: readonly ServiceHealthSnapshot[]
): string {
  const freePercent =
    hostSnapshot.memory.totalBytes > 0
      ? (hostSnapshot.memory.freeBytes / hostSnapshot.memory.totalBytes) * 100
      : 0;

  return [
    "System health:",
    `Uptime: ${formatDuration(hostSnapshot.uptimeSeconds)}`,
    `Load average: ${hostSnapshot.loadAverage
      .map((value) => value.toFixed(2))
      .join(", ")}`,
    `Memory: ${formatBytes(hostSnapshot.memory.freeBytes)} free / ${formatBytes(
      hostSnapshot.memory.totalBytes
    )} total (${freePercent.toFixed(1)}% free)`,
    "Services:",
    ...formatServiceHealth(serviceSnapshots),
    `Checked at: ${hostSnapshot.checkedAt.toISOString()}`
  ].join("\n");
}

function formatServiceHealth(
  snapshots: readonly ServiceHealthSnapshot[]
): readonly string[] {
  if (snapshots.length === 0) {
    return ["- none configured"];
  }

  return snapshots.map((snapshot) => {
    const detail = snapshot.detail ? ` (${snapshot.detail})` : "";

    return `- ${snapshot.name}: ${snapshot.status}${detail} at ${snapshot.checkedAt.toISOString()}`;
  });
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
