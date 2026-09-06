import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { DocumentType } from "../../../../core/domain/documents/document-record.js";
import type {
  LastOperationContext,
  PendingDocumentPlacementDecision
} from "../../../../ports/state-repository-port.js";
import type { StoreInboundFileResult } from "../../file-inbox/store-inbound-file.js";
import type { StoreMessageDocumentAttachmentResult } from "../../documents/store-message-document-attachments.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type { InboundIntent } from "../classify-inbound-intent.js";
import type {
  DocumentSearchDescriptionRecorder,
  MessageAttachmentStore,
  MessageDocumentAttachmentStore,
  PendingDocumentDecisionStore,
  PendingFileDestinationDecisionStore,
  PendingFileDuplicateDecisionStore,
  ReceiptWarrantyUploadProcessor
} from "../dispatch-accepted-command.js";
import type { FileUploadDestination } from "../dispatch-command-helpers.js";
import {
  attachmentIoErrorMessage,
  canUseLocalFileStorage,
  duplicateAttachmentReply,
  fileDestinationPrompt,
  formatPlacementSuggestionLines,
  formatUploadedDocumentsReply,
  formatUploadFolderChoicePrompt,
  mergeDocumentMetadata,
  parseDocumentMetadata,
  parseFileUploadDestination,
  parseModelDocumentMetadata,
  sourceAttachmentForDuplicate,
  suggestCopyName
} from "../dispatch-command-helpers.js";

export interface AttachmentStorageDependencies {
  readonly attachmentStore?: MessageAttachmentStore | undefined;
  readonly documentAttachmentStore?: MessageDocumentAttachmentStore | undefined;
  readonly pendingFileDestinationDecisions?:
    | PendingFileDestinationDecisionStore
    | undefined;
  readonly pendingFileDuplicateDecisions?:
    | PendingFileDuplicateDecisionStore
    | undefined;
  readonly pendingDocumentDecisions?: PendingDocumentDecisionStore | undefined;
  readonly receiptWarrantyUploadProcessor?:
    | ReceiptWarrantyUploadProcessor
    | undefined;
  readonly documentSearchDescriptionRecorder?:
    | DocumentSearchDescriptionRecorder
    | undefined;
  readonly now: () => Date;
  readonly saveLastOperation: (
    context: AcceptedMessageContext,
    input: Pick<
      LastOperationContext,
      "operationKind" | "entityKind" | "entityId" | "entityLabel" | "document"
    >
  ) => Promise<void>;
  readonly saveLastDocumentOperation: (
    context: AcceptedMessageContext,
    documents: readonly NonNullable<LastOperationContext["document"]>[],
    operationKind: Extract<
      LastOperationContext["operationKind"],
      "document_uploaded" | "document_registered"
    >
  ) => Promise<void>;
  readonly savePlacementSuggestion: (
    context: AcceptedMessageContext,
    documents: readonly PendingDocumentPlacementDecision["document"][]
  ) => Promise<boolean>;
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

/**
 * Shared attachment-storage service (DC-ARCH-001). Owns intake of message
 * attachments into local file storage or Google Drive, including the pending
 * destination / duplicate / folder-choice flows. Extracted from the dispatcher
 * so file/document feature handlers can depend on it directly. Behavior is
 * identical to the former dispatcher methods.
 */
export class AttachmentStorageService {
  constructor(private readonly deps: AttachmentStorageDependencies) {}

  async storeMessageAttachments(
    context: AcceptedMessageContext,
    intent?: Extract<InboundIntent, { readonly kind: "store_file" }>,
    destination: FileUploadDestination | undefined = parseFileUploadDestination(
      context.text
    )
  ): Promise<OutboundReply> {
    if (context.attachments.length === 0) {
      return {
        chatId: context.chat.id,
        text: "I can store a file after you attach one."
      };
    }

    if (!destination) {
      if (this.deps.documentAttachmentStore) {
        destination = "google_drive";
      } else if (!this.deps.pendingFileDestinationDecisions) {
        destination = "local_inbox";
      } else {
        const now = this.deps.now();
        await this.deps.pendingFileDestinationDecisions?.save({
          chatId: context.chat.id,
          actorId: context.actor.id,
          provider: context.provider,
          receivedAt: context.receivedAt,
          attachments: context.attachments,
          createdAt: now,
          expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS)
        });

        return {
          chatId: context.chat.id,
          text: fileDestinationPrompt(context.attachments)
        };
      }
    }

    if (destination === "google_drive") {
      return this.storeMessageDocumentAttachments(
        context,
        parseModelDocumentMetadata(intent)
      );
    }

    if (!canUseLocalFileStorage(context)) {
      return {
        chatId: context.chat.id,
        text: "Локальное хранилище доступно только админу. Файл не сохранен."
      };
    }

    let results: readonly StoreInboundFileResult[] | undefined;

    try {
      results = await this.deps.attachmentStore?.execute({
        provider: context.provider,
        receivedAt: context.receivedAt,
        attachments: context.attachments
      });
    } catch (error) {
      const message = attachmentIoErrorMessage(error);
      if (message) {
        return {
          chatId: context.chat.id,
          text: message
        };
      }

      throw error;
    }

    if (!results || results.length === 0) {
      return {
        chatId: context.chat.id,
        text: "No downloadable attachments found."
      };
    }

    const duplicates = results.filter(
      (
        result
      ): result is Extract<StoreInboundFileResult, { status: "duplicate" }> =>
        result.status === "duplicate"
    );

    if (duplicates.length > 0) {
      const first = duplicates[0];
      if (first) {
        const now = this.deps.now();
        await this.deps.pendingFileDuplicateDecisions?.save({
          chatId: context.chat.id,
          actorId: context.actor.id,
          fileName: first.fileName,
          suggestedCopyName: suggestCopyName(first.fileName),
          existingRecordId: first.existingRecord.id,
          provider: context.provider,
          receivedAt: context.receivedAt,
          ...sourceAttachmentForDuplicate(context.attachments, first.fileName),
          createdAt: now,
          expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS)
        });
      }

      return {
        chatId: context.chat.id,
        text: duplicateAttachmentReply(duplicates)
      };
    }

    const storedRecords = results.flatMap((result) =>
      result.status === "stored" ? [result.record] : []
    );
    const firstStoredRecord = storedRecords[0];

    if (firstStoredRecord) {
      await this.deps.saveLastOperation(context, {
        operationKind: "file_stored",
        entityKind: "file_inbox_record",
        entityId: firstStoredRecord.id,
        entityLabel: firstStoredRecord.originalFileName
      });
    }

    return {
      chatId: context.chat.id,
      text: intent?.summary
        ? `Saved ${storedRecords.length} attachment(s): ${intent.summary}.`
        : `Saved ${storedRecords.length} attachment(s).`
    };
  }

  async storeMessageDocumentAttachments(
    context: AcceptedMessageContext,
    metadataOverride: {
      readonly documentType?: DocumentType;
      readonly subjectId?: string;
    } = {}
  ): Promise<OutboundReply> {
    if (!this.deps.documentAttachmentStore) {
      return {
        chatId: context.chat.id,
        text: "Google Drive upload is not configured yet. File was not saved."
      };
    }

    const metadata = mergeDocumentMetadata(
      parseDocumentMetadata(context.text),
      metadataOverride
    );
    let results: readonly StoreMessageDocumentAttachmentResult[];

    try {
      results = await this.deps.documentAttachmentStore.execute({
        provider: context.provider,
        receivedAt: context.receivedAt,
        attachments: context.attachments,
        userText: context.text,
        ...metadata
      });
    } catch (error) {
      const message = attachmentIoErrorMessage(error);
      if (message) {
        return {
          chatId: context.chat.id,
          text: message
        };
      }

      throw error;
    }
    const folderChoices = results.flatMap((result) =>
      result.status === "needs_folder_choice" ? [result] : []
    );

    const choice = folderChoices[0];

    if (choice) {
      const now = this.deps.now();
      await this.deps.pendingDocumentDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        action: {
          kind: "choose_upload_folder",
          provider: context.provider,
          receivedAt: context.receivedAt.toISOString(),
          attachment: {
            fileName: choice.attachment.fileName,
            ...(choice.attachment.mimeType
              ? { mimeType: choice.attachment.mimeType }
              : {}),
            bytesBase64: Buffer.from(choice.attachment.bytes).toString("base64")
          },
          parentPath: choice.parentPath,
          parentFolderId: choice.parentFolderId,
          options: choice.options,
          ...(choice.documentType ? { documentType: choice.documentType } : {}),
          ...(choice.subjectId ? { subjectId: choice.subjectId } : {})
        },
        candidates: [],
        createdAt: now,
        expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS)
      });

      return {
        chatId: context.chat.id,
        text: formatUploadFolderChoicePrompt(choice)
      };
    }

    const uploadedDocuments = results.flatMap((result) =>
      result.status === "uploaded" ? [result.document] : []
    );

    if (uploadedDocuments.length === 0) {
      return {
        chatId: context.chat.id,
        text: "No downloadable attachments found."
      };
    }

    const receiptWarrantyProcessing = this.deps.receiptWarrantyUploadProcessor
      ? await this.deps.receiptWarrantyUploadProcessor.execute({
          documents: uploadedDocuments,
          ...(metadata.documentType
            ? { documentType: metadata.documentType }
            : {}),
          description: context.text,
          receivedAt: context.receivedAt,
          actorId: context.actor.id
        })
      : {
          documents: uploadedDocuments,
          replyLines: []
        };
    const describedDocuments = receiptWarrantyProcessing.documents;
    const warrantyReminderLines = receiptWarrantyProcessing.replyLines;

    if (
      !metadata.documentType &&
      !metadata.subjectId &&
      this.deps.documentSearchDescriptionRecorder
    ) {
      await this.deps.saveLastDocumentOperation(
        context,
        describedDocuments,
        "document_uploaded"
      );
      const now = this.deps.now();
      await this.deps.pendingDocumentDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        action: { kind: "describe_for_search" },
        candidates: describedDocuments,
        createdAt: now,
        expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS)
      });

      return {
        chatId: context.chat.id,
        text: [
          formatUploadedDocumentsReply(uploadedDocuments),
          "Как описать этот файл для поиска?",
          "Можно ответить коротко, например: личная карта Алекса, или skip."
        ].join("\n")
      };
    }

    if (!metadata.documentType && !metadata.subjectId) {
      await this.deps.saveLastDocumentOperation(
        context,
        describedDocuments,
        "document_uploaded"
      );
      const now = this.deps.now();
      await this.deps.pendingDocumentDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        action: { kind: "update_metadata" },
        candidates: describedDocuments,
        createdAt: now,
        expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS)
      });

      return {
        chatId: context.chat.id,
        text: [
          formatUploadedDocumentsReply(uploadedDocuments),
          "Какой это документ?",
          "Можно ответить тип и subject, например: identity max, или skip."
        ].join("\n")
      };
    }

    const placementSuggested = await this.deps.savePlacementSuggestion(
      context,
      describedDocuments
    );
    await this.deps.saveLastDocumentOperation(
      context,
      describedDocuments,
      "document_uploaded"
    );

    return {
      chatId: context.chat.id,
      text: [
        formatUploadedDocumentsReply(describedDocuments),
        ...(placementSuggested && describedDocuments[0]
          ? formatPlacementSuggestionLines(describedDocuments[0])
          : []),
        ...warrantyReminderLines
      ].join("\n")
    };
  }
}
