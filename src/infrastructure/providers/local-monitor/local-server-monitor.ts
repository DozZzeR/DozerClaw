import { freemem, loadavg, totalmem, uptime } from "node:os";

import type {
  HostHealthSnapshot,
  ServerMonitorPort
} from "../../../ports/server-monitor-port.js";

export class LocalServerMonitor implements ServerMonitorPort {
  async getHostHealth(): Promise<HostHealthSnapshot> {
    return {
      checkedAt: new Date(),
      uptimeSeconds: uptime(),
      loadAverage: loadavg(),
      memory: {
        totalBytes: totalmem(),
        freeBytes: freemem()
      }
    };
  }
}
