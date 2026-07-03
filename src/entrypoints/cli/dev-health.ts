import { pathToFileURL } from "node:url";

import { buildApp } from "../../composition/build-app.js";

export interface DevHealthHarnessOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
}

export async function runDevHealthHarness(
  options: DevHealthHarnessOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write("dev health harness is not available in production.");

    return 1;
  }

  const provider = options.env.DOZERCLAW_DEV_PROVIDER ?? "dev";
  const providerUserId = options.env.DOZERCLAW_DEV_OWNER_USER_ID ?? "owner";
  const providerChatId =
    options.env.DOZERCLAW_DEV_OWNER_CHAT_ID ?? "owner-private";
  const displayName = options.env.DOZERCLAW_DEV_OWNER_NAME ?? "Owner";
  const text = options.env.DOZERCLAW_DEV_MESSAGE_TEXT ?? "health";
  const now = new Date();
  const app = buildApp({ env: options.env });

  await app.bootstrapOwnerIdentity({
    provider,
    providerUserId,
    providerChatId,
    displayName
  });

  const reply = await app.handleNormalizedInboundMessage({
    messageId: `dev-health-${now.toISOString()}`,
    provider,
    providerUserId,
    providerChatId,
    chatKind: "owner_private",
    displayName,
    text,
    receivedAt: now,
    now
  });

  options.write(reply.text);

  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevHealthHarness({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
