import { pathToFileURL } from "node:url";

import { buildApp } from "../../composition/build-app.js";
import type { AttachmentDownloadPort } from "../../ports/attachment-download-port.js";
import type { BootstrapOwnerIdentityInput } from "../../application/use-cases/identity/bootstrap-owner-identity.js";
import type { HandleNormalizedInboundMessageInput } from "../../application/use-cases/messaging/handle-normalized-inbound-message.js";
import type { OutboundReply } from "../../core/domain/messaging/reply.js";

export interface DevGoogleDriveSmokeApp {
  bootstrapOwnerIdentity(input: BootstrapOwnerIdentityInput): Promise<unknown>;
  handleNormalizedInboundMessage(
    input: HandleNormalizedInboundMessageInput
  ): Promise<OutboundReply>;
}

export interface DevGoogleDriveSmokeOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
  readonly buildSmokeApp?: () => Promise<DevGoogleDriveSmokeApp>;
}

const DEFAULT_FILE_NAME = "dozerclaw-drive-smoke.txt";
const DEFAULT_FILE_TEXT = "DozerClaw Google Drive smoke file";

export async function runDevGoogleDriveSmoke(
  options: DevGoogleDriveSmokeOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write("dev Google Drive smoke is not available in production.");

    return 1;
  }

  const app = options.buildSmokeApp
    ? await options.buildSmokeApp()
    : buildDefaultSmokeApp(options.env);
  const provider = options.env.DOZERCLAW_DEV_PROVIDER ?? "dev";
  const providerUserId = options.env.DOZERCLAW_DEV_OWNER_USER_ID ?? "owner";
  const providerChatId =
    options.env.DOZERCLAW_DEV_OWNER_CHAT_ID ?? "owner-private";
  const displayName = options.env.DOZERCLAW_DEV_OWNER_NAME ?? "Owner";
  const fileName =
    options.env.DOZERCLAW_DEV_GOOGLE_DRIVE_SMOKE_FILE_NAME ?? DEFAULT_FILE_NAME;
  const documentMetadata =
    options.env.DOZERCLAW_DEV_GOOGLE_DRIVE_SMOKE_METADATA ?? "identity max";

  await app.bootstrapOwnerIdentity({
    provider,
    providerUserId,
    providerChatId,
    displayName
  });

  const replies: string[] = [];
  const steps = [
    {
      text: "save this",
      attachments: [
        {
          id: "drive-smoke-attachment",
          providerFileId: "drive-smoke-provider-file",
          fileName,
          mimeType: "text/plain",
          sizeBytes: DEFAULT_FILE_TEXT.length
        }
      ]
    },
    {
      text: "Google Drive",
      attachments: []
    },
    {
      text: documentMetadata,
      attachments: []
    },
    {
      text: "yes",
      attachments: []
    }
  ] as const;

  for (const [index, step] of steps.entries()) {
    try {
      const reply = await app.handleNormalizedInboundMessage({
        messageId: `drive-smoke-${index + 1}`,
        provider,
        providerUserId,
        providerChatId,
        chatKind: "owner_private",
        displayName,
        text: step.text,
        attachments: step.attachments,
        receivedAt: new Date(),
        now: new Date()
      });
      replies.push(reply.text);
      options.write(`reply ${index + 1}: ${reply.text}`);
    } catch (error) {
      options.write(
        `smoke error: ${error instanceof Error ? error.message : String(error)}`
      );
      options.write("smoke result: failed");

      return 1;
    }
  }

  const moved = replies.at(-1)?.startsWith("Готово: переместил") ?? false;
  options.write(`smoke result: ${moved ? "moved" : "not moved"}`);

  return moved ? 0 : 1;
}

function buildDefaultSmokeApp(env: NodeJS.ProcessEnv): DevGoogleDriveSmokeApp {
  return buildApp({
    env,
    attachmentDownloader: new DevSmokeAttachmentDownloader(env)
  });
}

class DevSmokeAttachmentDownloader implements AttachmentDownloadPort {
  constructor(private readonly env: NodeJS.ProcessEnv) {}

  async downloadAttachment() {
    const text =
      this.env.DOZERCLAW_DEV_GOOGLE_DRIVE_SMOKE_FILE_TEXT ?? DEFAULT_FILE_TEXT;
    const fileName =
      this.env.DOZERCLAW_DEV_GOOGLE_DRIVE_SMOKE_FILE_NAME ?? DEFAULT_FILE_NAME;

    return {
      fileName,
      mimeType: "text/plain",
      bytes: new TextEncoder().encode(text)
    };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevGoogleDriveSmoke({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
