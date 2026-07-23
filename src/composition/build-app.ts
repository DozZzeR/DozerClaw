import { randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";

import type { DozerClawApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { StartupDiagnostic } from "../core/domain/diagnostics/startup-diagnostic.js";
import { BootstrapOwnerIdentityUseCase } from "../application/use-cases/identity/bootstrap-owner-identity.js";
import { ListPendingAccessRequestsUseCase } from "../application/use-cases/identity/list-pending-access-requests.js";
import { ReviewPendingIdentityUseCase } from "../application/use-cases/identity/review-pending-identity.js";
import { ActivateAdminSessionUseCase } from "../application/use-cases/identity/activate-admin-session.js";
import { ModelInboundIntentClassifier } from "../application/use-cases/messaging/classify-inbound-intent.js";
import { ModelPendingChoiceClassifier } from "../application/use-cases/messaging/classify-pending-choice.js";
import { StoreInboundFileUseCase } from "../application/use-cases/file-inbox/store-inbound-file.js";
import { ResolveFileDuplicateDecisionUseCase } from "../application/use-cases/file-inbox/resolve-file-duplicate-decision.js";
import { StoreMessageAttachmentsUseCase } from "../application/use-cases/file-inbox/store-message-attachments.js";
import { RegisterDocumentUseCase } from "../application/use-cases/documents/register-document.js";
import { FindDocumentsUseCase } from "../application/use-cases/documents/find-documents.js";
import { ManageDocumentRecordUseCase } from "../application/use-cases/documents/manage-document-record.js";
import { RecordDocumentSearchDescriptionUseCase } from "../application/use-cases/documents/record-document-search-description.js";
import { StoreMessageDocumentAttachmentsUseCase } from "../application/use-cases/documents/store-message-document-attachments.js";
import { UploadFileInboxDocumentUseCase } from "../application/use-cases/documents/upload-file-inbox-document.js";
import { QueryPlanningStateUseCase } from "../application/use-cases/planning/query-planning-state.js";
import { ManagePlanningTaskUseCase } from "../application/use-cases/planning/manage-planning-task.js";
import { RecordFamilyFactUseCase } from "../application/use-cases/family-memory/record-family-fact.js";
import { RecallFamilyFactsUseCase } from "../application/use-cases/family-memory/recall-family-facts.js";
import { ArchiveFamilyFactUseCase } from "../application/use-cases/family-memory/archive-family-fact.js";
import { ManageSubjectAliasesUseCase } from "../application/use-cases/family-memory/manage-subject-aliases.js";
import { ResolveFamilyFactDecisionUseCase } from "../application/use-cases/family-memory/resolve-family-fact-decision.js";
import { ResolveIdentityContextUseCase } from "../application/use-cases/identity/resolve-identity-context.js";
import { GetHostHealthUseCase } from "../application/use-cases/health/get-host-health.js";
import { GetServiceHealthUseCase } from "../application/use-cases/health/get-service-health.js";
import { HandleSystemHealthCommandUseCase } from "../application/use-cases/health/handle-system-health-command.js";
import { DispatchAcceptedCommandUseCase } from "../application/use-cases/messaging/dispatch-accepted-command.js";
import type { DuplicateDecision } from "../application/use-cases/messaging/dispatch-accepted-command.js";
import { HandleNormalizedInboundMessageUseCase } from "../application/use-cases/messaging/handle-normalized-inbound-message.js";
import { ProcessInboundMessageUseCase } from "../application/use-cases/messaging/process-inbound-message.js";
import { LocalFileStorage } from "../infrastructure/providers/local-file-storage/local-file-storage.js";
import { LocalServerMonitor } from "../infrastructure/providers/local-monitor/local-server-monitor.js";
import { RegistryServiceMonitor } from "../infrastructure/providers/local-monitor/registry-service-monitor.js";
import { CodexCliModelProvider } from "../infrastructure/providers/codex/codex-cli-model-provider.js";
import { MempalaceMemoryProvider } from "../infrastructure/providers/mempalace/mempalace-memory-provider.js";
import { JsonDocumentFolderPolicy } from "../infrastructure/providers/document-folder-policy/json-document-folder-policy.js";
import { GoogleDriveDocumentStorageProvider } from "../infrastructure/providers/google-drive/google-drive-document-storage.js";
import { SingularityPlanningProvider } from "../infrastructure/providers/singularity/singularity-planning-provider.js";
import { createSqliteDatabase } from "../infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteEventLog } from "../infrastructure/providers/sqlite/sqlite-event-log.js";
import { SqliteDocumentRepository } from "../infrastructure/providers/sqlite/sqlite-document-repository.js";
import { SqliteFamilyMemoryRepository } from "../infrastructure/providers/sqlite/sqlite-family-memory-repository.js";
import { SqliteFileInboxRepository } from "../infrastructure/providers/sqlite/sqlite-file-inbox-repository.js";
import { SqliteIdentityAccessRepository } from "../infrastructure/providers/sqlite/sqlite-identity-access-repository.js";
import { SqliteServiceRegistryRepository } from "../infrastructure/providers/sqlite/sqlite-service-registry-repository.js";
import { SqliteStateRepository } from "../infrastructure/providers/sqlite/sqlite-state-repository.js";
import { SqliteSubjectAliasRepository } from "../infrastructure/providers/sqlite/sqlite-subject-alias-repository.js";
import type { AttachmentDownloadPort } from "../ports/attachment-download-port.js";
import type { DocumentFolderPolicyPort } from "../ports/document-folder-policy-port.js";
import type { DocumentStoragePort } from "../ports/document-storage-port.js";
import type { ModelPort } from "../ports/model-port.js";
import type { PlanningPort } from "../ports/planning-port.js";
import type { AdminSecretVerifierPort } from "../ports/admin-secret-verifier-port.js";

export interface BuildAppOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly attachmentDownloader?: AttachmentDownloadPort;
  readonly documentStorage?: DocumentStoragePort;
  readonly documentFolderPolicy?: DocumentFolderPolicyPort;
  readonly modelProvider?: ModelPort;
  readonly planningProvider?: PlanningPort;
}

export function buildApp(options: BuildAppOptions = {}): DozerClawApp {
  const config = loadConfig(options.env ?? process.env);
  const database = createSqliteDatabase({ path: config.sqlite.databasePath });
  const stateRepository = new SqliteStateRepository(database);
  const eventLog = new SqliteEventLog(database);
  const identityAccessRepository = new SqliteIdentityAccessRepository(database);
  const serviceRegistryRepository = new SqliteServiceRegistryRepository(database);
  const documentRepository = new SqliteDocumentRepository(database);
  const fileInboxRepository = new SqliteFileInboxRepository(database);
  const familyMemoryRepository = new SqliteFamilyMemoryRepository(database);
  const subjectAliasRepository = new SqliteSubjectAliasRepository(database);
  const generateId = () => randomUUID();
  const bootstrapOwnerIdentity = new BootstrapOwnerIdentityUseCase({
    repository: identityAccessRepository,
    generateId
  });
  const resolveIdentityContext = new ResolveIdentityContextUseCase({
    repository: identityAccessRepository,
    generateId
  });
  const listPendingAccessRequests = new ListPendingAccessRequestsUseCase({
    repository: identityAccessRepository
  });
  const reviewPendingIdentity = new ReviewPendingIdentityUseCase({
    repository: identityAccessRepository
  });
  const activateAdminSession = config.admin
    ? new ActivateAdminSessionUseCase({
        repository: identityAccessRepository,
        verifier: new StaticAdminSecretVerifier(config.admin.secret),
        generateId,
        ttlMs: config.admin.ttlMs
      })
    : undefined;
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
  const semanticMemory = config.memory?.mempalace
    ? new MempalaceMemoryProvider(config.memory.mempalace)
    : undefined;
  const familyFactRecorder = new RecordFamilyFactUseCase({
    repository: familyMemoryRepository,
    ...(semanticMemory ? { semanticMemory } : {}),
    subjectAliases: subjectAliasRepository,
    generateId,
    now: () => new Date()
  });
  const factDecisionResolver = new ResolveFamilyFactDecisionUseCase({
    repository: familyMemoryRepository,
    ...(semanticMemory ? { semanticMemory } : {}),
    now: () => new Date()
  });
  const fileStorage = new LocalFileStorage({
    rootDirectory: config.fileStorage.rootDirectory,
    generateId
  });
  const fileStore = new StoreInboundFileUseCase({
    fileStorage,
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
  const duplicateDecisionResolver = options.attachmentDownloader
    ? new ResolveFileDuplicateDecisionUseCase({
        attachmentDownloader: options.attachmentDownloader,
        fileStorage,
        repository: fileInboxRepository,
        generateId,
        now: () => new Date()
      })
    : undefined;
  const documentStorage =
    options.documentStorage ??
    (config.googleDrive
      ? new GoogleDriveDocumentStorageProvider(config.googleDrive)
      : undefined);
  const documentFolderPolicy =
    options.documentFolderPolicy ??
    loadDocumentFolderPolicy(
      options.env?.DOZERCLAW_DOCUMENT_FOLDER_POLICY_PATH ??
        (config.environment === "test" ? undefined : "config/document-folder-policy.json")
    );
  const documentRegistrar = documentStorage
    ? new RegisterDocumentUseCase({
        repository: documentRepository,
        storage: documentStorage,
        generateId,
        now: () => new Date()
      })
    : undefined;
  const documentAttachmentStore =
    options.attachmentDownloader && documentStorage
      ? new StoreMessageDocumentAttachmentsUseCase({
          attachmentDownloader: options.attachmentDownloader,
          documentStorage,
          ...(documentFolderPolicy ? { documentFolderPolicy } : {}),
          repository: documentRepository,
          generateId,
          now: () => new Date()
        })
      : undefined;
  const fileInboxDocumentUploader = documentStorage
    ? new UploadFileInboxDocumentUseCase({
        fileInboxRepository,
        fileStorage,
        fileStorageSearch: fileStorage,
        documentStorage,
        documentRepository,
        generateId,
        now: () => new Date()
      })
    : undefined;
  const documentLookup = new FindDocumentsUseCase({
    repository: documentRepository,
    ...(semanticMemory ? { semanticMemory } : {}),
    limit: 10
  });
  const documentManager = new ManageDocumentRecordUseCase({
    repository: documentRepository,
    now: () => new Date()
  });
  const documentSearchDescriptionRecorder = semanticMemory
    ? new RecordDocumentSearchDescriptionUseCase({
        repository: documentRepository,
        semanticMemory,
        now: () => new Date()
      })
    : undefined;
  const modelProvider = options.modelProvider
    ? options.modelProvider
    : config.codex.modelRoutingEnabled
      ? new CodexCliModelProvider({
          model: config.codex.model,
          timeoutMs: config.codex.timeoutMs,
          maxConcurrency: config.codex.maxConcurrency,
          projectRoot: config.codex.projectRoot,
          tmpDirectory: config.codex.tmpDirectory,
          ...(config.codex.apiKey ? { apiKey: config.codex.apiKey } : {})
      })
      : undefined;
  const familyFactRecall = new RecallFamilyFactsUseCase({
    repository: familyMemoryRepository,
    ...(semanticMemory ? { semanticMemory } : {}),
    subjectAliases: subjectAliasRepository,
    recentLimit: 50,
    resultLimit: 10,
    semanticLimit: config.memory?.mempalace?.searchLimit ?? 5,
    ...(modelProvider ? { model: modelProvider } : {})
  });
  const familyFactArchiver = new ArchiveFamilyFactUseCase({
    repository: familyMemoryRepository,
    now: () => new Date(),
    recentLimit: 50
  });
  const subjectAliasManager = new ManageSubjectAliasesUseCase({
    repository: subjectAliasRepository
  });
  const planningProvider =
    options.planningProvider ??
    (config.planning?.singularity
      ? new SingularityPlanningProvider(config.planning.singularity)
      : undefined);
  const planningQuery = planningProvider
    ? new QueryPlanningStateUseCase({
        planning: planningProvider
      })
    : undefined;
  const planningTaskManager = planningProvider
    ? new ManagePlanningTaskUseCase({
        planning: planningProvider
      })
    : undefined;
  const intentClassifier = modelProvider
    ? new ModelInboundIntentClassifier({
        model: modelProvider
      })
    : undefined;
  const pendingChoiceClassifier = modelProvider
    ? new ModelPendingChoiceClassifier<DuplicateDecision>({
        model: modelProvider
      })
    : undefined;
  const dispatchAcceptedCommand = new DispatchAcceptedCommandUseCase({
    systemHealthHandler,
    eventLog,
    ...(attachmentStore ? { attachmentStore } : {}),
    ...(documentAttachmentStore ? { documentAttachmentStore } : {}),
    ...(fileInboxDocumentUploader ? { fileInboxDocumentUploader } : {}),
    ...(documentSearchDescriptionRecorder
      ? { documentSearchDescriptionRecorder }
      : {}),
    ...(duplicateDecisionResolver ? { duplicateDecisionResolver } : {}),
    familyFactRecorder,
    familyFactRecall,
    ...(planningQuery ? { planningQuery } : {}),
    ...(planningTaskManager ? { planningTaskManager } : {}),
    familyFactArchiver,
    ...(documentRegistrar ? { documentRegistrar } : {}),
    documentLookup,
    documentManager,
    subjectAliasManager,
    factDecisionResolver,
    pendingAccessRequests: {
      list: () => listPendingAccessRequests.execute(),
      review: (input) => reviewPendingIdentity.execute(input)
    },
    ...(activateAdminSession
      ? { adminSessionActivator: activateAdminSession }
      : {}),
    pendingClarifications: {
      findActiveByChatId: (chatId, now) =>
        stateRepository.findActivePendingClarificationByChatId(chatId, now),
      save: (input) => stateRepository.savePendingClarification(input),
      clearByChatId: (chatId) =>
        stateRepository.clearPendingClarificationByChatId(chatId)
    },
    pendingFileDuplicateDecisions: {
      findActiveByChatId: (chatId, now) =>
        stateRepository.findActivePendingFileDuplicateDecisionByChatId(
          chatId,
          now
        ),
      save: (input) => stateRepository.savePendingFileDuplicateDecision(input),
      clearByChatId: (chatId) =>
        stateRepository.clearPendingFileDuplicateDecisionByChatId(chatId)
    },
    pendingFileDestinationDecisions: {
      findActiveByChatId: (chatId, now) =>
        stateRepository.findActivePendingFileDestinationDecisionByChatId(
          chatId,
          now
        ),
      save: (input) => stateRepository.savePendingFileDestinationDecision(input),
      clearByChatId: (chatId) =>
        stateRepository.clearPendingFileDestinationDecisionByChatId(chatId)
    },
    pendingFamilyFactDecisions: {
      findActiveByChatId: (chatId, now) =>
        stateRepository.findActivePendingFamilyFactDecisionByChatId(chatId, now),
      save: (input) => stateRepository.savePendingFamilyFactDecision(input),
      clearByChatId: (chatId) =>
        stateRepository.clearPendingFamilyFactDecisionByChatId(chatId)
    },
    pendingFamilyFactArchiveDecisions: {
      findActiveByChatId: (chatId, now) =>
        stateRepository.findActivePendingFamilyFactArchiveDecisionByChatId(
          chatId,
          now
        ),
      save: (input) =>
        stateRepository.savePendingFamilyFactArchiveDecision(input),
      clearByChatId: (chatId) =>
        stateRepository.clearPendingFamilyFactArchiveDecisionByChatId(chatId)
    },
    pendingDocumentDecisions: {
      findActiveByChatId: (chatId, now) =>
        stateRepository.findActivePendingDocumentDecisionByChatId(chatId, now),
      save: (input) => stateRepository.savePendingDocumentDecision(input),
      clearByChatId: (chatId) =>
        stateRepository.clearPendingDocumentDecisionByChatId(chatId)
    },
    ...(intentClassifier ? { intentClassifier } : {}),
    ...(pendingChoiceClassifier ? { pendingChoiceClassifier } : {})
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

class StaticAdminSecretVerifier implements AdminSecretVerifierPort {
  constructor(private readonly expectedSecret: string) {}

  async verifyAdminSecret(secret: string): Promise<boolean> {
    const expected = Buffer.from(this.expectedSecret);
    const actual = Buffer.from(secret);

    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
}

function loadDocumentFolderPolicy(
  path: string | undefined
): DocumentFolderPolicyPort | undefined {
  if (!path || !existsSync(path)) {
    return undefined;
  }

  return JsonDocumentFolderPolicy.fromFile(path);
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
