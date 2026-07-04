import { randomUUID } from "node:crypto";

import type { DozerClawApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { StartupDiagnostic } from "../core/domain/diagnostics/startup-diagnostic.js";
import { BootstrapOwnerIdentityUseCase } from "../application/use-cases/identity/bootstrap-owner-identity.js";
import { StoreInboundFileUseCase } from "../application/use-cases/file-inbox/store-inbound-file.js";
import { StoreMessageAttachmentsUseCase } from "../application/use-cases/file-inbox/store-message-attachments.js";
import { ResolveIdentityContextUseCase } from "../application/use-cases/identity/resolve-identity-context.js";
import { GetHostHealthUseCase } from "../application/use-cases/health/get-host-health.js";
import { GetServiceHealthUseCase } from "../application/use-cases/health/get-service-health.js";
import { HandleSystemHealthCommandUseCase } from "../application/use-cases/health/handle-system-health-command.js";
import { DispatchAcceptedCommandUseCase } from "../application/use-cases/messaging/dispatch-accepted-command.js";
import { HandleNormalizedInboundMessageUseCase } from "../application/use-cases/messaging/handle-normalized-inbound-message.js";
import { ProcessInboundMessageUseCase } from "../application/use-cases/messaging/process-inbound-message.js";
import { LocalFileStorage } from "../infrastructure/providers/local-file-storage/local-file-storage.js";
import { LocalServerMonitor } from "../infrastructure/providers/local-monitor/local-server-monitor.js";
import { RegistryServiceMonitor } from "../infrastructure/providers/local-monitor/registry-service-monitor.js";
import { createSqliteDatabase } from "../infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteEventLog } from "../infrastructure/providers/sqlite/sqlite-event-log.js";
import { SqliteFileInboxRepository } from "../infrastructure/providers/sqlite/sqlite-file-inbox-repository.js";
import { SqliteIdentityAccessRepository } from "../infrastructure/providers/sqlite/sqlite-identity-access-repository.js";
import { SqliteServiceRegistryRepository } from "../infrastructure/providers/sqlite/sqlite-service-registry-repository.js";
import { SqliteStateRepository } from "../infrastructure/providers/sqlite/sqlite-state-repository.js";
import type { AttachmentDownloadPort } from "../ports/attachment-download-port.js";

export interface BuildAppOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly attachmentDownloader?: AttachmentDownloadPort;
}

export function buildApp(options: BuildAppOptions = {}): DozerClawApp {
  const config = loadConfig(options.env ?? process.env);
  const database = createSqliteDatabase({ path: config.sqlite.databasePath });
  const stateRepository = new SqliteStateRepository(database);
  const eventLog = new SqliteEventLog(database);
  const identityAccessRepository = new SqliteIdentityAccessRepository(database);
  const serviceRegistryRepository = new SqliteServiceRegistryRepository(database);
  const fileInboxRepository = new SqliteFileInboxRepository(database);
  const generateId = () => randomUUID();
  const bootstrapOwnerIdentity = new BootstrapOwnerIdentityUseCase({
    repository: identityAccessRepository,
    generateId
  });
  const resolveIdentityContext = new ResolveIdentityContextUseCase({
    repository: identityAccessRepository,
    generateId
  });
  const processInboundMessage = new ProcessInboundMessageUseCase({
    identityContextResolver: resolveIdentityContext,
    identityRepository: identityAccessRepository
  });
  const getHostHealth = new GetHostHealthUseCase({
    serverMonitor: new LocalServerMonitor()
  });
  const getServiceHealth = new GetServiceHealthUseCase({
    serviceMonitor: new RegistryServiceMonitor({
      repository: serviceRegistryRepository
    })
  });
  const systemHealthHandler = new HandleSystemHealthCommandUseCase({
    getHostHealth,
    getServiceHealth
  });
  const fileStore = new StoreInboundFileUseCase({
    fileStorage: new LocalFileStorage({
      rootDirectory: config.fileStorage.rootDirectory,
      generateId
    }),
    repository: fileInboxRepository,
    generateId,
    now: () => new Date()
  });
  const attachmentStore = options.attachmentDownloader
    ? new StoreMessageAttachmentsUseCase({
        attachmentDownloader: options.attachmentDownloader,
        fileStore
      })
    : undefined;
  const dispatchAcceptedCommand = new DispatchAcceptedCommandUseCase({
    systemHealthHandler,
    ...(attachmentStore ? { attachmentStore } : {})
  });
  const handleNormalizedInboundMessage = new HandleNormalizedInboundMessageUseCase(
    {
      pipeline: processInboundMessage,
      dispatcher: dispatchAcceptedCommand
    }
  );

  return {
    async getStartupDiagnostics() {
      const stateRepositoryHealth = await stateRepository.healthCheck();
      const eventLogHealth = await eventLog.healthCheck();

      return [
        {
          name: "composition",
          status: "ok",
          detail: "DozerClaw composition root initialized"
        },
        {
          name: "environment",
          status: config.environment === "production" ? "ok" : "degraded",
          detail: `environment=${config.environment}`
        },
        healthToDiagnostic(
          "state_repository",
          stateRepositoryHealth.ok,
          stateRepositoryHealth.detail
        ),
        healthToDiagnostic("event_log", eventLogHealth.ok, eventLogHealth.detail)
      ];
    },
    bootstrapOwnerIdentity(input) {
      return bootstrapOwnerIdentity.execute(input);
    },
    handleNormalizedInboundMessage(input) {
      return handleNormalizedInboundMessage.execute(input);
    }
  };
}

function healthToDiagnostic(
  name: string,
  ok: boolean,
  detail: string | undefined
): StartupDiagnostic {
  return {
    name,
    status: ok ? "ok" : "failed",
    ...(detail ? { detail } : {})
  };
}
