import type { MorningDigestRunResult } from "../application/use-cases/calendar/send-morning-digest.js";
import type { StartupDiagnostic } from "../core/domain/diagnostics/startup-diagnostic.js";
import type {
  BootstrapOwnerIdentityInput,
  BootstrapOwnerIdentityResult
} from "../application/use-cases/identity/bootstrap-owner-identity.js";
import type {
  HandleNormalizedInboundMessageInput
} from "../application/use-cases/messaging/handle-normalized-inbound-message.js";
import type { OutboundReply } from "../core/domain/messaging/reply.js";

export interface DozerClawApp {
  getStartupDiagnostics(): Promise<readonly StartupDiagnostic[]>;
  bootstrapOwnerIdentity(
    input: BootstrapOwnerIdentityInput
  ): Promise<BootstrapOwnerIdentityResult>;
  handleNormalizedInboundMessage(
    input: HandleNormalizedInboundMessageInput
  ): Promise<OutboundReply>;
  runMorningDigestTick?(now?: Date): Promise<MorningDigestRunResult | undefined>;
  startBackgroundSchedulers?(options?: {
    readonly onError?: (error: unknown) => void;
  }): void;
  stopBackgroundSchedulers?(): void;
  close?(): void;
}
