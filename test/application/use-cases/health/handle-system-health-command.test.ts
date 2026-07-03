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
      },
      getServiceHealth: {
        async execute() {
          return [
            {
              name: "planner",
              status: "ok",
              detail: "responding",
              checkedAt: new Date("2026-07-02T20:00:01.000Z")
            },
            {
              name: "archive",
              status: "degraded",
              checkedAt: new Date("2026-07-02T20:00:02.000Z")
            }
          ];
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
        "Services:",
        "- planner: ok (responding) at 2026-07-02T20:00:01.000Z",
        "- archive: degraded at 2026-07-02T20:00:02.000Z",
        "Checked at: 2026-07-02T20:00:00.000Z"
      ].join("\n")
    });
  });

  it("reports when no services are configured", async () => {
    const useCase = new HandleSystemHealthCommandUseCase({
      getHostHealth: {
        async execute() {
          return {
            checkedAt: new Date("2026-07-02T20:00:00.000Z"),
            uptimeSeconds: 0,
            loadAverage: [0, 0, 0],
            memory: {
              totalBytes: 0,
              freeBytes: 0
            }
          };
        }
      },
      getServiceHealth: {
        async execute() {
          return [];
        }
      }
    });

    const reply = await useCase.execute({ chatId: "chat-owner" });

    expect(reply.text).toContain("Services:");
    expect(reply.text).toContain("- none configured");
  });
});
