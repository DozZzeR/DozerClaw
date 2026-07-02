import { describe, expect, it } from "vitest";

import { HandleSystemHealthCommandUseCase } from "../../../../src/application/use-cases/health/handle-system-health-command.js";

describe("HandleSystemHealthCommandUseCase", () => {
  it("returns a transport-neutral system health reply", async () => {
    const useCase = new HandleSystemHealthCommandUseCase({
      getHostHealth: {
        async execute() {
          return {
            checkedAt: new Date("2026-07-02T20:00:00.000Z"),
            uptimeSeconds: 3661,
            loadAverage: [0.1, 0.2, 0.3],
            memory: {
              totalBytes: 1000,
              freeBytes: 250
            }
          };
        }
      }
    });

    await expect(useCase.execute({ chatId: "chat-owner" })).resolves.toEqual({
      chatId: "chat-owner",
      text: [
        "System health:",
        "Uptime: 1h 1m 1s",
        "Load average: 0.10, 0.20, 0.30",
        "Memory: 250 B free / 1000 B total (25.0% free)",
        "Checked at: 2026-07-02T20:00:00.000Z"
      ].join("\n")
    });
  });
});
