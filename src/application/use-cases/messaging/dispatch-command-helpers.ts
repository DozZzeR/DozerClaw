// Pure helpers extracted from dispatch-accepted-command.ts (DC-ARCH-001, stage 1).
import type { AcceptedMessageContext } from "./process-inbound-message.js";

import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { AccessAction } from "../../../core/domain/identity/access-policy.js";
import type { DocumentType } from "../../../core/domain/documents/document-record.js";
import type { DocumentUploadFolderOption } from "../../../ports/document-folder-policy-port.js";
import type {
  LastOperationContext,
  PendingClarification,
  PendingDocumentDecision,
  PendingDocumentPlacementDecision,
  PendingFamilyFactDecision,
  PendingFileDestinationDecision
} from "../../../ports/state-repository-port.js";
import type { FamilyFactDecision } from "../family-memory/resolve-family-fact-decision.js";
import type { ManageSubjectAliasesInput } from "../family-memory/manage-subject-aliases.js";
import type { RecordFamilyFactResult } from "../family-memory/record-family-fact.js";
import type { RecordDocumentSearchDescriptionResult } from "../documents/record-document-search-description.js";
import type { RegisterDocumentResult } from "../documents/register-document.js";
import type { StoreMessageDocumentAttachmentResult } from "../documents/store-message-document-attachments.js";
import type { StoreInboundFileResult } from "../file-inbox/store-inbound-file.js";
import type { ShoppingItemDecision } from "../shopping/dispatch-shopping-request.js";
import type { InboundIntent } from "./classify-inbound-intent.js";
import type { PendingChoiceOption } from "./classify-pending-choice.js";
import type { PendingDecisionPolicy } from "./resolve-pending-decision.js";
import { nextPlanningCalendarDate } from "../planning/planning-calendar-date.js";
export function parseActorId(text: string): string | undefined {
  const [, actorId] = text.trim().split(/\s+/, 2);

  return actorId;
}

export function buildClarificationClassifierText(
  pending: PendingClarification,
  followUpText: string
): string {
  return [
    `Previous message: ${pending.originalText}`,
    `Assistant asked: ${pending.question}`,
    `User clarification: ${followUpText}`
  ].join("\n");
}

export function buildPendingFileDestinationInterruptionClassifierText(
  pending: PendingFileDestinationDecision,
  followUpText: string
): string {
  const names = pending.attachments
    .map((attachment) => attachment.fileName)
    .filter((value): value is string => Boolean(value));
  const fileList = names.length > 0 ? names.join(", ") : "uploaded attachment(s)";

  return [
    `Pending operation: choose where to save uploaded file(s): ${fileList}.`,
    "The user can continue it by choosing local inbox or Google Drive.",
    "If the current reply is a separate command, classify that command normally.",
    `User reply: ${followUpText}`
  ].join("\n");
}

export function buildPendingDocumentPlacementInterruptionClassifierText(
  pending: PendingDocumentPlacementDecision,
  followUpText: string
): string {
  return [
    `Pending operation: decide whether to move document ${pending.document.name}.`,
    `Suggested folder: ${pending.targetFolderPath}.`,
    "The user can continue it by accepting the move or skipping it.",
    "If the current reply is a separate command, classify that command normally.",
    `User reply: ${followUpText}`
  ].join("\n");
}

export function mergeAttachments(
  previous: readonly MessageAttachment[],
  current: readonly MessageAttachment[]
): readonly MessageAttachment[] {
  const seen = new Set<string>();
  const merged: MessageAttachment[] = [];

  for (const attachment of [...previous, ...current]) {
    if (seen.has(attachment.id)) {
      continue;
    }

    seen.add(attachment.id);
    merged.push(attachment);
  }

  return merged;
}

export function duplicateAttachmentReply(
  duplicates: readonly Extract<StoreInboundFileResult, { status: "duplicate" }>[]
): string {
  const [first] = duplicates;

  if (!first) {
    return "Такой файл уже есть.";
  }

  return duplicateDecisionPrompt(first.fileName, suggestCopyName(first.fileName));
}

export function attachmentIoErrorMessage(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);

  if (/exceeds max size/u.test(message)) {
    return "Attachment is too large for current safety limits. File was not saved.";
  }

  if (/timed out after/u.test(message)) {
    return "Attachment transfer timed out. File was not saved; please try again later.";
  }

  return undefined;
}

export function sourceAttachmentForDuplicate(
  attachments: readonly MessageAttachment[],
  fileName: string
): { readonly sourceAttachment: MessageAttachment } | Record<string, never> {
  const sourceAttachment =
    attachments.find((attachment) => attachment.fileName === fileName) ??
    attachments.find((attachment) => Boolean(attachment.providerFileId));

  return sourceAttachment ? { sourceAttachment } : {};
}

export function suggestCopyName(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return `${fileName} (2)`;
  }

  return `${fileName.slice(0, extensionIndex)} (2)${fileName.slice(extensionIndex)}`;
}

export type DuplicateDecision = "copy" | "overwrite" | "skip";
export type FileUploadDestination = "local_inbox" | "google_drive";
export type PendingDecisionChoice =
  | DuplicateDecision
  | FamilyFactDecision
  | PlacementDecision
  | ShoppingItemDecision;
export type PendingRoutingEventAttributes = {
  readonly pendingKind:
    | "file_destination"
    | "file_duplicate"
    | "document_placement";
  readonly policy: PendingDecisionPolicy;
  readonly choiceResult: string;
  readonly interruptionIntent?: string;
  readonly pendingCleared: boolean;
};
export const fileDestinationDecisionPolicy =
  "safe_interruptible" satisfies PendingDecisionPolicy;
export const documentPlacementDecisionPolicy =
  "safe_interruptible" satisfies PendingDecisionPolicy;

export const duplicateDecisionOptions: readonly PendingChoiceOption<DuplicateDecision>[] = [
  {
    value: "copy",
    label: "сохранить копию",
    description: "Save a second file under the suggested copy name."
  },
  {
    value: "overwrite",
    label: "перезаписать существующий файл",
    description: "Replace the existing file."
  },
  {
    value: "skip",
    label: "ничего не делать",
    description: "Leave the existing file unchanged."
  }
];

export const placementDecisionOptions: readonly PendingChoiceOption<PlacementDecision>[] = [
  {
    value: "accept",
    label: "переместить файл",
    description: "Move the document to the suggested folder."
  },
  {
    value: "skip",
    label: "оставить как есть",
    description: "Leave the document in its current folder."
  }
];

export function duplicateDecisionPrompt(
  fileName: string,
  suggestedCopyName: string
): string {
  return [
    `Файл уже есть: ${fileName}.`,
    "Что сделать?",
    `- сохранить копию как ${suggestedCopyName}`,
    "- перезаписать существующий файл",
    "- ничего не делать"
  ].join("\n");
}

export function parseFileUploadDestination(
  text: string
): FileUploadDestination | undefined {
  const normalized = text.trim().toLowerCase();

  if (
    /\b(google\s*drive|drive)\b/.test(normalized) ||
    /гугл\s*диск|google\s*диск|диск|гугл/.test(normalized)
  ) {
    return "google_drive";
  }

  if (
    /\b(local|inbox|locally)\b/.test(normalized) ||
    /локаль|инбокс|входящ|на сервер/.test(normalized)
  ) {
    return "local_inbox";
  }

  return undefined;
}

export function parseModelFileUploadDestination(
  intent: Extract<InboundIntent, { readonly kind: "store_file" }> | undefined
): FileUploadDestination | undefined {
  return intent?.destination;
}

export function resolveFileUploadDestinationForModelIntent(
  text: string,
  intent: Extract<InboundIntent, { readonly kind: "store_file" }> | undefined
): FileUploadDestination | undefined {
  const deterministicDestination = parseFileUploadDestination(text);

  if (deterministicDestination) {
    return deterministicDestination;
  }

  const modelDestination = parseModelFileUploadDestination(intent);

  return modelDestination === "google_drive" ? modelDestination : undefined;
}

export function canUseLocalFileStorage(context: AcceptedMessageContext): boolean {
  return context.actor.role === "owner";
}

export function parseModelDocumentMetadata(
  intent: Extract<InboundIntent, { readonly kind: "store_file" }> | undefined
): {
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
} {
  return {
    ...(intent?.documentType ? { documentType: intent.documentType } : {}),
    ...(intent?.subjectId ? { subjectId: intent.subjectId } : {})
  };
}

export function fileDestinationPrompt(attachments: readonly MessageAttachment[]): string {
  const names = attachments
    .map((attachment) => attachment.fileName)
    .filter((value): value is string => Boolean(value));

  return [
    names.length > 0
      ? `Куда сохранить файл: ${names.join(", ")}?`
      : "Куда сохранить вложение?",
    "Можно ответить:",
    "- local inbox",
    "- Google Drive"
  ].join("\n");
}

export const documentTypes = [
  "identity",
  "legal",
  "health",
  "finance",
  "education",
  "travel",
  "home",
  "receipt",
  "warranty",
  "reference",
  "other"
] as const satisfies readonly DocumentType[];

export function parseDocumentMetadata(text: string): {
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
} {
  const normalized = text.trim().toLowerCase();
  const tokens = normalized
    .split(/[^a-zа-яё0-9_-]+/u)
    .filter((token) => token.length > 0);
  const documentType = parseDocumentType(tokens);
  const subjectId =
    documentType === "receipt" || documentType === "warranty"
      ? undefined
      : parseDocumentSubject(tokens);

  return {
    ...(documentType ? { documentType } : {}),
    ...(subjectId ? { subjectId } : {})
  };
}

export function mergeDocumentMetadata(
  deterministic: {
    readonly documentType?: DocumentType;
    readonly subjectId?: string;
  },
  fallback: {
    readonly documentType?: DocumentType;
    readonly subjectId?: string;
  }
): {
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
} {
  if (!fallback.documentType && !fallback.subjectId) {
    return deterministic;
  }

  const documentType = deterministic.documentType ?? fallback.documentType;
  const subjectId = deterministic.documentType
    ? deterministic.subjectId ?? fallback.subjectId
    : fallback.subjectId;

  return {
    ...(documentType ? { documentType } : {}),
    ...(subjectId ? { subjectId } : {})
  };
}

export function parseDocumentType(tokens: readonly string[]): DocumentType | undefined {
  for (const token of tokens) {
    if ((documentTypes as readonly string[]).includes(token)) {
      return token as DocumentType;
    }

    if (
      token === "passport" ||
      token === "id" ||
      token === "карта" ||
      token === "удостоверение"
    ) {
      return "identity";
    }

    if (token === "visa" || token === "ticket") {
      return "travel";
    }

    if (token === "receipt" || token === "чек" || token === "чека") {
      return "receipt";
    }

    if (
      token === "warranty" ||
      token === "guarantee" ||
      token === "гарантия" ||
      token === "гарантии" ||
      token === "гарантийный"
    ) {
      return "warranty";
    }
  }

  return undefined;
}

export function parseDocumentSubject(tokens: readonly string[]): string | undefined {
  const ignored = new Set([
    ...documentTypes,
    "google",
    "drive",
    "local",
    "inbox",
    "save",
    "store",
    "upload",
    "uploaded",
    "put",
    "file",
    "document",
    "this",
    "it",
    "to",
    "in",
    "as",
    "for",
    "passport",
    "id",
    "карта",
    "личная",
    "удостоверение",
    "visa",
    "ticket",
    "receipt",
    "чек",
    "чека",
    "warranty",
    "guarantee",
    "гарантия",
    "гарантии",
    "гарантийный",
    "гугл",
    "диск",
    "файл",
    "документ",
    "сохрани",
    "загрузи",
    "для",
    "как",
    "это",
    "в"
  ]);

  return tokens.find(
    (token) =>
      !ignored.has(token) &&
      /^[a-zа-яё][a-zа-яё0-9_-]{1,31}$/u.test(token)
  );
}

export function parseSkipDocumentMetadata(text: string): boolean {
  const normalized = text.trim().toLowerCase();

  return (
    /\b(skip|cancel|nothing|later)\b/.test(normalized) ||
    /пропусти|отмена|ничего|потом|не надо/.test(normalized)
  );
}

export function selectedUploadFolderMetadata(
  action: Extract<
    PendingDocumentDecision["action"],
    { readonly kind: "choose_upload_folder" }
  >,
  decision: DocumentUploadFolderOption
): {
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
} {
  const documentType = action.documentType ?? documentTypeFromFolderOption(decision);
  const subjectId = action.subjectId ?? subjectIdFromFolderOption(decision);

  return {
    ...(documentType ? { documentType } : {}),
    ...(subjectId ? { subjectId } : {})
  };
}

export function documentTypeFromFolderOption(
  option: DocumentUploadFolderOption
): DocumentType | undefined {
  return option.documentTypes?.some((type) =>
    ["passport", "id_card", "driver_license", "birth_certificate"].includes(type)
  )
    ? "identity"
    : undefined;
}

export function subjectIdFromFolderOption(
  option: DocumentUploadFolderOption
): string | undefined {
  const [subject] = option.subjects ?? [];

  return subject;
}

export function isUploadedDocumentMetadataDecision(
  pending: PendingDocumentDecision
): boolean {
  return (
    pending.action.kind === "update_metadata" &&
    !pending.action.documentType &&
    !pending.action.subjectId &&
    pending.candidates.length > 0
  );
}

export function formatUploadedDocumentsReply(
  documents: readonly RegisterDocumentResult["document"][]
): string {
  return [
    `Uploaded ${documents.length} document(s) to Google Drive:`,
    ...documents.map(formatUploadedDocumentLine)
  ].join("\n");
}

export function formatUploadedDocumentLine(
  document: RegisterDocumentResult["document"]
): string {
  const metadata = [
    document.documentType,
    document.subjectId ? `subject: ${document.subjectId}` : undefined
  ].filter((value): value is string => Boolean(value));
  const name = metadata.length > 0
    ? `${document.name} (${metadata.join(", ")})`
    : document.name;

  return `- ${name}\n  ${document.url}`;
}

export function formatUploadFolderChoicePrompt(
  choice: Extract<
    StoreMessageDocumentAttachmentResult,
    { readonly status: "needs_folder_choice" }
  >
): string {
  return [
    `Куда сохранить ${choice.attachment.fileName}?`,
    `Выбрана папка ${choice.parentPath}, но в ней есть подпапки:`,
    ...choice.options.map((option, index) => `${index + 1}. ${option.path}`),
    "Ответь номером, названием папки или \"отмена\"."
  ].join("\n");
}

export function parseUploadFolderChoice(
  text: string,
  options: readonly { readonly path: string; readonly folderId: string }[]
): { readonly path: string; readonly folderId: string } | "cancel" | undefined {
  const normalized = text.trim().toLowerCase();

  if (/^(cancel|skip|отмена|отмени|не надо)$/u.test(normalized)) {
    return "cancel";
  }

  const numeric = Number.parseInt(normalized, 10);

  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= options.length) {
    return options[numeric - 1];
  }

  return options.find((option) => {
    const path = option.path.toLowerCase();
    const lastSegment = path.split("/").at(-1)?.toLowerCase();

    return path.includes(normalized) || lastSegment === normalized;
  });
}

export function formatDocumentSearchDescriptionResult(
  document: RegisterDocumentResult["document"],
  result: RecordDocumentSearchDescriptionResult
): string {
  return result.status === "stored"
    ? `Сохранил описание для поиска: ${document.name}.`
    : `Документ сохранен, но описание для поиска пока не записано: ${document.name}.`;
}

export function canonicalDocumentFolderPath(
  document: PendingDocumentPlacementDecision["document"]
): string {
  return [
    "Family Documents",
    document.subjectId ?? "family",
    document.documentType ?? "other"
  ].join("/");
}

export function formatPlacementSuggestionLines(
  document: PendingDocumentPlacementDecision["document"] | undefined
): string[] {
  if (!document) {
    return [];
  }

  const targetFolderPath = canonicalDocumentFolderPath(document);

  return [
    `Предлагаю папку: ${targetFolderPath}`,
    "Переместить файл туда? Ответь yes или skip."
  ];
}

export function placementDecisionPrompt(
  pending: PendingDocumentPlacementDecision
): string {
  return [
    `Я жду решение по размещению ${pending.document.name}.`,
    `Предлагаемая папка: ${pending.targetFolderPath}`,
    "Можно ответить yes или skip."
  ].join("\n");
}

export type PlacementDecision = "accept" | "skip";

export function parsePlacementDecision(text: string): PlacementDecision | undefined {
  const normalized = text.trim().toLowerCase();
  const tokens = normalized
    .split(/[^a-zа-яё0-9_-]+/u)
    .filter((token) => token.length > 0);

  if (
    /\b(yes|ok|move|accept|confirm)\b/.test(normalized) ||
    tokens.includes("да") ||
    tokens.includes("ок") ||
    /перемести|подтверж|соглас/.test(normalized)
  ) {
    return "accept";
  }

  if (
    /\b(no|skip|cancel|nothing|later)\b/.test(normalized) ||
    tokens.includes("нет") ||
    /пропусти|отмена|ничего|потом|не надо/.test(normalized)
  ) {
    return "skip";
  }

  return undefined;
}

export function formatRegisteredDocumentReply(
  document: RegisterDocumentResult["document"]
): string {
  const metadata = [
    document.documentType,
    document.subjectId ? `subject: ${document.subjectId}` : undefined
  ].filter((value): value is string => Boolean(value));

  if (metadata.length === 0) {
    return `Registered document: ${document.name}`;
  }

  return `Registered document: ${document.name} (${metadata.join(", ")})`;
}

export function parseDuplicateDecision(text: string): DuplicateDecision | undefined {
  const normalized = text.trim().toLowerCase();

  if (
    /\b(copy|duplicate)\b/.test(normalized) ||
    /копи|дубликат|сохрани.*коп/.test(normalized)
  ) {
    return "copy";
  }

  if (
    /\b(overwrite|replace)\b/.test(normalized) ||
    /перезап|замен|перепиш/.test(normalized)
  ) {
    return "overwrite";
  }

  if (
    /\b(skip|nothing|cancel)\b/.test(normalized) ||
    /ничего|отмен|не надо|забей/.test(normalized)
  ) {
    return "skip";
  }

  return undefined;
}

export const familyFactDecisionOptions: readonly PendingChoiceOption<FamilyFactDecision>[] = [
  {
    value: "update",
    label: "обновить существующий факт",
    description: "Update the existing family fact with the new wording."
  },
  {
    value: "create",
    label: "создать новый факт",
    description: "Save the new memory as a separate family fact."
  },
  {
    value: "cancel",
    label: "отменить изменение",
    description: "Leave family memory unchanged."
  }
];

export function familyFactDecisionPrompt(pending: PendingFamilyFactDecision): string {
  return [
    "Нужно решить, что сделать с семейным фактом.",
    `Новый факт: ${pending.newFact.body}`,
    "Похожие существующие факты:",
    ...pending.candidates.map((fact, index) => `${index + 1}. ${fact.body}`),
    "Что сделать?",
    "- обновить существующий факт",
    "- создать новый факт",
    "- отменить изменение"
  ].join("\n");
}

export function parseFamilyFactDecision(
  text: string
): { readonly decision: FamilyFactDecision; readonly candidateIndex?: number } | undefined {
  const normalized = text.trim().toLowerCase();
  const candidateIndex = parseCandidateIndex(normalized);

  if (
    /\b(update|replace)\b/.test(normalized) ||
    /обнов|замен|перезап/.test(normalized)
  ) {
    return {
      decision: "update",
      ...(candidateIndex !== undefined ? { candidateIndex } : {})
    };
  }

  if (
    /\b(create|new|separate)\b/.test(normalized) ||
    /созд|нов|отдельн/.test(normalized)
  ) {
    return {
      decision: "create"
    };
  }

  if (
    /\b(cancel|skip|nothing)\b/.test(normalized) ||
    /отмен|ничего|не надо|забей/.test(normalized)
  ) {
    return {
      decision: "cancel"
    };
  }

  return undefined;
}

export function parseFamilyFactArchiveDecision(
  text: string
): number | "cancel" | undefined {
  const normalized = text.trim().toLowerCase();

  if (
    /\b(cancel|skip|nothing)\b/.test(normalized) ||
    /отмен|ничего|не надо|забей/.test(normalized)
  ) {
    return "cancel";
  }

  return parseCandidateIndex(normalized);
}

export function parseCandidateIndex(normalizedText: string): number | undefined {
  const numeric = normalizedText.match(/\b([1-9]\d*)\b/);

  if (numeric) {
    return Number(numeric[1]) - 1;
  }

  if (/\b(second|2nd)\b|втор/.test(normalizedText)) {
    return 1;
  }

  if (/\b(third|3rd)\b|трет/.test(normalizedText)) {
    return 2;
  }

  if (/\b(first|1st)\b|перв/.test(normalizedText)) {
    return 0;
  }

  return undefined;
}

export function toSubjectAliasAction(
  intent: Extract<
    InboundIntent,
    {
      readonly kind:
        | "save_subject_alias"
        | "list_subject_aliases"
        | "delete_subject_alias"
        | "diagnose_subject_aliases";
    }
  >
): ManageSubjectAliasesInput {
  if (intent.kind === "save_subject_alias") {
    return {
      action: "save",
      aliasSubjectId: intent.aliasSubjectId,
      canonicalSubjectId: intent.canonicalSubjectId
    };
  }

  if (intent.kind === "delete_subject_alias") {
    return {
      action: "delete",
      aliasSubjectId: intent.aliasSubjectId
    };
  }

  if (intent.kind === "diagnose_subject_aliases") {
    return {
      action: "diagnose"
    };
  }

  return {
    action: "list"
  };
}

export function scopedClassifierText(text: string): string {
  const scoped = parseModelScopeCommandRail(text);

  if (!scoped) {
    return text;
  }

  return [
    `Command scope: ${scoped.scope}`,
    `User text: ${scoped.text}`
  ].join("\n");
}

export function parseModelScopeCommandRail(
  text: string
): { readonly scope: string; readonly text: string } | undefined {
  const trimmed = text.trim();
  const match = trimmed.match(
    /^\/?(fact|journal|doc|document|plan|planning)\b\s*(.*)$/iu
  );

  if (!match) {
    return undefined;
  }

  const command = match[1]?.toLowerCase();
  const railText = match[2]?.trim();

  if (!command || !railText) {
    return undefined;
  }

  return {
    scope: modelScopeForCommand(command),
    text: railText
  };
}

export function modelScopeForCommand(command: string): string {
  if (command === "fact") {
    return "family_fact";
  }

  if (command === "journal") {
    return "family_journal";
  }

  if (command === "doc" || command === "document") {
    return "document";
  }

  return "planning";
}

export function commandRailsHelpText(): string {
  return [
    "Команды DozerClaw:",
    "/shop <товар> - сохранить покупку",
    "/shop bought <товар> - отметить покупку купленной",
    "/find <запрос> - найти открытые покупки",
    "/fact <текст> - работать с семейной памятью",
    "/journal <текст> - работать с семейным дневником",
    "/doc <текст> - работать с документами",
    "/plan <текст> - работать с планами",
    "/health - состояние системы"
  ].join("\n");
}

export function domainClarificationQuestion(): string {
  return [
    "Я не понял, в какой области это обработать.",
    "Ответь: покупка, семейная память, дневник, документы или планы.",
    "Можно также использовать /shop, /fact, /journal, /doc или /plan."
  ].join("\n");
}

export function requiredAccessActionForIntent(
  intent: InboundIntent
): AccessAction | undefined {
  if (
    intent.kind === "store_file" ||
    intent.kind === "record_fact" ||
    intent.kind === "record_journal_entry" ||
    intent.kind === "record_shopping_item" ||
    intent.kind === "manage_shopping_item" ||
    intent.kind === "archive_fact" ||
    intent.kind === "register_document" ||
    intent.kind === "update_document" ||
    intent.kind === "archive_document" ||
    intent.kind === "create_reminder" ||
    intent.kind === "manage_planning" ||
    intent.kind === "update_last_operation" ||
    intent.kind === "save_subject_alias" ||
    intent.kind === "delete_subject_alias"
  ) {
    return "family_write";
  }

  return undefined;
}

export function toClassifierLastOperation(input: LastOperationContext) {
  return {
    operationKind: input.operationKind,
    entityKind: input.entityKind,
    entityId: input.entityId,
    ...(input.entityLabel ? { entityLabel: input.entityLabel } : {})
  };
}

export function documentFromLastOperation(
  input: LastOperationContext | undefined
): LastOperationContext["document"] | undefined {
  if (
    input?.entityKind === "document" &&
    (input.operationKind === "document_uploaded" ||
      input.operationKind === "document_registered") &&
    input.document
  ) {
    return input.document;
  }

  return undefined;
}

export function planningDateFromIntent(
  context: AcceptedMessageContext,
  intent: Extract<
    InboundIntent,
    { readonly kind: "create_reminder" | "manage_planning" }
  >,
  timeZone: string
): { readonly date?: string } {
  if (intent.kind === "manage_planning" && intent.date) {
    return {
      date: intent.date
    };
  }

  if (/\b(tomorrow)\b|завтра/iu.test(context.text)) {
    return {
      date: nextPlanningCalendarDate(context.receivedAt, timeZone)
    };
  }

  return {};
}

export function parseAdminSecret(text: string): string | undefined {
  const match = /^(?:\/admin|admin)\s+(.+)$/i.exec(text.trim());
  const secret = match?.[1]?.trim();

  return secret || undefined;
}

export function parseNotificationId(text: string): string | undefined {
  const match = /^(?:\/read|read)\s+(.+)$/i.exec(text.trim());
  const notificationId = match?.[1]?.trim();

  return notificationId || undefined;
}

export function formatFamilyFactConfirmation(
  result: Extract<RecordFamilyFactResult, { readonly status: "needs_confirmation" }>
): string {
  return [
    "This may update an existing family fact.",
    `New fact: ${result.newFact.body}`,
    "Existing candidates:",
    ...result.candidates.map((fact, index) => `${index + 1}. ${fact.body}`),
    "Reply whether to update an existing fact or create a new one."
  ].join("\n");
}
