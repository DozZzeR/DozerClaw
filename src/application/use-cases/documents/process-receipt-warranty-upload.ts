import type {
  DocumentRecord,
  DocumentType
} from "../../../core/domain/documents/document-record.js";
import type {
  ManagePlanningTaskInput,
  ManagePlanningTaskResult
} from "../planning/manage-planning-task.js";
import type {
  RecordDocumentSearchDescriptionInput,
  RecordDocumentSearchDescriptionResult
} from "./record-document-search-description.js";

export interface ReceiptWarrantySearchDescriptionRecorder {
  execute(
    input: RecordDocumentSearchDescriptionInput
  ): Promise<RecordDocumentSearchDescriptionResult>;
}

export interface ReceiptWarrantyPlanningTaskManager {
  execute(input: ManagePlanningTaskInput): Promise<ManagePlanningTaskResult>;
}

export interface ProcessReceiptWarrantyUploadDependencies {
  readonly documentSearchDescriptionRecorder?: ReceiptWarrantySearchDescriptionRecorder;
  readonly planningTaskManager?: ReceiptWarrantyPlanningTaskManager;
}

export interface ProcessReceiptWarrantyUploadInput {
  readonly documents: readonly DocumentRecord[];
  readonly documentType?: DocumentType;
  readonly description: string;
  readonly receivedAt: Date;
  readonly actorId: string;
}

export interface ProcessReceiptWarrantyUploadResult {
  readonly documents: readonly DocumentRecord[];
  readonly replyLines: readonly string[];
}

export class ProcessReceiptWarrantyUploadUseCase {
  constructor(
    private readonly dependencies: ProcessReceiptWarrantyUploadDependencies
  ) {}

  async execute(
    input: ProcessReceiptWarrantyUploadInput
  ): Promise<ProcessReceiptWarrantyUploadResult> {
    const documents = await this.recordSearchDescriptions(input);
    const replyLines = await this.createWarrantyReminder({
      ...input,
      documents
    });

    return {
      documents,
      replyLines
    };
  }

  private async recordSearchDescriptions(
    input: ProcessReceiptWarrantyUploadInput
  ): Promise<readonly DocumentRecord[]> {
    if (
      !this.dependencies.documentSearchDescriptionRecorder ||
      !isReceiptWarrantyType(input.documentType)
    ) {
      return input.documents;
    }

    const description = input.description.trim();

    if (!description) {
      return input.documents;
    }

    const describedDocuments: DocumentRecord[] = [];

    for (const document of input.documents) {
      try {
        const result =
          await this.dependencies.documentSearchDescriptionRecorder.execute({
            document,
            description
          });

        describedDocuments.push(result.document);
      } catch {
        describedDocuments.push(document);
      }
    }

    return describedDocuments;
  }

  private async createWarrantyReminder(
    input: ProcessReceiptWarrantyUploadInput
  ): Promise<readonly string[]> {
    if (
      !this.dependencies.planningTaskManager ||
      !isReceiptWarrantyType(input.documentType)
    ) {
      return [];
    }

    const document = input.documents[0];
    const reminder = parseWarrantyReminder(
      input.description,
      input.receivedAt,
      document
    );

    if (!reminder) {
      return [];
    }

    try {
      const result = await this.dependencies.planningTaskManager.execute({
        action: "create",
        title: reminder.title,
        date: reminder.date,
        actorId: input.actorId
      });

      return result.status === "created"
        ? [`Создал напоминание по гарантии на ${reminder.date}.`]
        : [];
    } catch {
      return [];
    }
  }
}

interface WarrantyReminder {
  readonly title: string;
  readonly date: string;
}

function isReceiptWarrantyType(
  documentType: DocumentType | undefined
): documentType is "receipt" | "warranty" {
  return documentType === "receipt" || documentType === "warranty";
}

function parseWarrantyReminder(
  text: string,
  receivedAt: Date,
  document: DocumentRecord | undefined
): WarrantyReminder | undefined {
  const term = parseWarrantyTerm(text);

  if (!term) {
    return undefined;
  }

  const dueDate = addWarrantyTerm(receivedAt, term);
  const documentName = document?.name ? ` (${document.name})` : "";

  return {
    title: `Проверить гарантию: ${text.trim()}${documentName}`,
    date: formatCalendarDate(dueDate)
  };
}

function parseWarrantyTerm(
  text: string
): { readonly years?: number; readonly months?: number } | undefined {
  const normalized = text.toLowerCase();
  const yearMatch = normalized.match(
    /(?:гаранти\p{L}*|warranty|guarantee)[^\d]{0,24}(\d{1,2})\s*(?:г(?:од|ода|одов)?|лет|year|years|yr|yrs)(?:\s|$|[.,;:!?])/u
  );

  if (yearMatch?.[1]) {
    return {
      years: Number(yearMatch[1])
    };
  }

  const monthMatch = normalized.match(
    /(?:гаранти\p{L}*|warranty|guarantee)[^\d]{0,24}(\d{1,2})\s*(?:мес(?:яц|яца|яцев)?|month|months|mo)(?:\s|$|[.,;:!?])/u
  );

  if (monthMatch?.[1]) {
    return {
      months: Number(monthMatch[1])
    };
  }

  return undefined;
}

function addWarrantyTerm(
  date: Date,
  term: { readonly years?: number; readonly months?: number }
): Date {
  const dueDate = new Date(date.getTime());

  if (term.years) {
    dueDate.setUTCFullYear(dueDate.getUTCFullYear() + term.years);
  }

  if (term.months) {
    dueDate.setUTCMonth(dueDate.getUTCMonth() + term.months);
  }

  return dueDate;
}

function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
