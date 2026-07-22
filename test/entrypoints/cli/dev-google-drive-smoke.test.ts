import { describe, expect, it } from "vitest";

import {
  runDevGoogleDriveSmoke,
  type DevGoogleDriveSmokeApp
} from "../../../src/entrypoints/cli/dev-google-drive-smoke.js";
import type { OutboundReply } from "../../../src/core/domain/messaging/reply.js";

describe("runDevGoogleDriveSmoke", () => {
  it("blocks production", async () => {
    const lines: string[] = [];

    const exitCode = await runDevGoogleDriveSmoke({
      env: {
        NODE_ENV: "production"
      },
      write: (line) => lines.push(line)
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual(["dev Google Drive smoke is not available in production."]);
  });

  it("runs the expected upload and placement message sequence", async () => {
    const lines: string[] = [];
    const app = new FakeSmokeApp([
      "Куда сохранить файл: dozerclaw-drive-smoke.txt?",
      "Uploaded 1 document(s) to Google Drive:\n- dozerclaw-drive-smoke.txt\n  https://drive.google.com/open?id=drive-smoke-id",
      "Updated document: dozerclaw-drive-smoke.txt (identity, subject: max)",
      "Готово: переместил dozerclaw-drive-smoke.txt в Family Documents/max/identity."
    ]);
    const cleanup = new FakeSmokeCleanup();

    const exitCode = await runDevGoogleDriveSmoke({
      env: {
        NODE_ENV: "test"
      },
      write: (line) => lines.push(line),
      buildSmokeApp: async () => app,
      buildCleanup: async () => cleanup
    });

    expect(exitCode).toBe(0);
    expect(app.bootstrapped).toBe(true);
    expect(app.messages.map((message) => message.text)).toEqual([
      "save this",
      "Google Drive",
      "identity max",
      "yes"
    ]);
    expect(app.messages[0]?.attachments).toHaveLength(1);
    expect(cleanup.deletedExternalIds).toEqual(["drive-smoke-id"]);
    expect(lines).toContain("cleanup result: deleted");
    expect(lines.at(-1)).toBe("smoke result: moved");
  });

  it("skips cleanup when disabled", async () => {
    const lines: string[] = [];
    const app = new FakeSmokeApp([
      "Куда сохранить файл: dozerclaw-drive-smoke.txt?",
      "Uploaded 1 document(s) to Google Drive:\n- dozerclaw-drive-smoke.txt\n  https://drive.google.com/open?id=drive-smoke-id",
      "Updated document: dozerclaw-drive-smoke.txt (identity, subject: max)",
      "Готово: переместил dozerclaw-drive-smoke.txt в Family Documents/max/identity."
    ]);
    const cleanup = new FakeSmokeCleanup();

    const exitCode = await runDevGoogleDriveSmoke({
      env: {
        NODE_ENV: "test",
        DOZERCLAW_DEV_GOOGLE_DRIVE_SMOKE_CLEANUP: "0"
      },
      write: (line) => lines.push(line),
      buildSmokeApp: async () => app,
      buildCleanup: async () => cleanup
    });

    expect(exitCode).toBe(0);
    expect(cleanup.deletedExternalIds).toEqual([]);
    expect(lines).not.toContain("cleanup result: deleted");
  });

  it("returns non-zero when cleanup fails", async () => {
    const lines: string[] = [];
    const app = new FakeSmokeApp([
      "Куда сохранить файл: dozerclaw-drive-smoke.txt?",
      "Uploaded 1 document(s) to Google Drive:\n- dozerclaw-drive-smoke.txt\n  https://drive.google.com/open?id=drive-smoke-id",
      "Updated document: dozerclaw-drive-smoke.txt (identity, subject: max)",
      "Готово: переместил dozerclaw-drive-smoke.txt в Family Documents/max/identity."
    ]);

    const exitCode = await runDevGoogleDriveSmoke({
      env: {
        NODE_ENV: "test"
      },
      write: (line) => lines.push(line),
      buildSmokeApp: async () => app,
      buildCleanup: async () => new ThrowingSmokeCleanup()
    });

    expect(exitCode).toBe(1);
    expect(lines).toContain("cleanup error: cleanup failed");
    expect(lines.at(-1)).toBe("smoke result: cleanup failed");
  });

  it("returns non-zero when final placement did not move", async () => {
    const lines: string[] = [];
    const app = new FakeSmokeApp([
      "Куда сохранить файл: dozerclaw-drive-smoke.txt?",
      "Uploaded 1 document(s) to Google Drive:\n- dozerclaw-drive-smoke.txt",
      "Updated document: dozerclaw-drive-smoke.txt (identity, subject: max)",
      "Не двигаю dozerclaw-drive-smoke.txt: для папки Family Documents/max/identity пока не настроен Drive folder id."
    ]);

    const exitCode = await runDevGoogleDriveSmoke({
      env: {
        NODE_ENV: "test"
      },
      write: (line) => lines.push(line),
      buildSmokeApp: async () => app
    });

    expect(exitCode).toBe(1);
    expect(lines.at(-1)).toBe("smoke result: not moved");
  });

  it("returns non-zero when a smoke step throws", async () => {
    const lines: string[] = [];
    const app = new ThrowingSmokeApp();

    const exitCode = await runDevGoogleDriveSmoke({
      env: {
        NODE_ENV: "test"
      },
      write: (line) => lines.push(line),
      buildSmokeApp: async () => app
    });

    expect(exitCode).toBe(1);
    expect(lines).toContain("smoke error: Google Drive upload failed: HTTP 403");
    expect(lines.at(-1)).toBe("smoke result: failed");
  });
});

class FakeSmokeApp implements DevGoogleDriveSmokeApp {
  bootstrapped = false;
  readonly messages: Array<{
    readonly text: string;
    readonly attachments: readonly unknown[];
  }> = [];

  constructor(private readonly replies: readonly string[]) {}

  async bootstrapOwnerIdentity() {
    this.bootstrapped = true;

    return {
      status: "created" as const,
      actorId: "actor-owner"
    };
  }

  async handleNormalizedInboundMessage(input: {
    readonly text: string;
    readonly attachments: readonly unknown[];
  }) {
    this.messages.push({
      text: input.text,
      attachments: input.attachments
    });

    return {
      chatId: "owner-private",
      text: this.replies[this.messages.length - 1] ?? ""
    };
  }
}

class ThrowingSmokeApp implements DevGoogleDriveSmokeApp {
  async bootstrapOwnerIdentity() {
    return undefined;
  }

  async handleNormalizedInboundMessage(): Promise<OutboundReply> {
    throw new Error("Google Drive upload failed: HTTP 403");
  }
}

class FakeSmokeCleanup {
  readonly deletedExternalIds: string[] = [];

  async deleteDocument(input: { readonly externalId: string }) {
    this.deletedExternalIds.push(input.externalId);
  }
}

class ThrowingSmokeCleanup {
  async deleteDocument() {
    throw new Error("cleanup failed");
  }
}
