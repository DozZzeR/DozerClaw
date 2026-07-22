import { pathToFileURL } from "node:url";

import type {
  DocumentRecord,
  DocumentType
} from "../../core/domain/documents/document-record.js";
import { loadConfig } from "../../composition/config.js";
import { createSqliteDatabase } from "../../infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteDocumentRepository } from "../../infrastructure/providers/sqlite/sqlite-document-repository.js";

export interface DevRepairDocumentsOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
}

interface RepairPlan {
  readonly document: DocumentRecord;
  readonly changes: readonly RepairChange[];
}

type RepairChange =
  | {
      readonly field: "documentType";
      readonly before?: DocumentType;
      readonly after: DocumentType;
    }
  | {
      readonly field: "subjectId";
      readonly before?: string;
      readonly after: string;
    }
  | {
      readonly field: "url";
      readonly before: string;
      readonly after: string;
    };

export async function runDevRepairDocuments(
  options: DevRepairDocumentsOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write("dev document repair is not available in production.");

    return 1;
  }

  const apply = parseApplyFlag(options.env.DOZERCLAW_DEV_REPAIR_DOCUMENTS_APPLY);
  options.write(`document repair mode: ${apply ? "apply" : "dry-run"}`);

  const config = loadConfig(options.env);
  const database = createSqliteDatabase({ path: config.sqlite.databasePath });
  const repository = new SqliteDocumentRepository(database);

  try {
    const documents = await repository.searchDocuments({
      limit: 1000
    });
    const plans = documents.flatMap((document) => {
      const plan = planDocumentRepair(document);

      return plan ? [plan] : [];
    });

    for (const plan of plans) {
      options.write(`planned: ${plan.document.name} ${formatChanges(plan.changes)}`);

      if (apply) {
        await repository.saveDocument(applyRepairPlan(plan));
      }
    }

    options.write(
      `summary: planned=${plans.length} applied=${apply ? plans.length : 0} skipped=${documents.length - plans.length}`
    );

    return 0;
  } finally {
    database.close();
  }
}

function planDocumentRepair(document: DocumentRecord): RepairPlan | undefined {
  if (document.provider !== "google_drive" || document.status !== "registered") {
    return undefined;
  }

  const changes: RepairChange[] = [];
  const inferredDocumentType = inferDocumentType(document);
  const inferredSubjectId = inferSubjectId(document);
  const canonicalUrl = formatGoogleDriveFileUrl(document.externalId);
  const highConfidence = Boolean(inferredDocumentType || inferredSubjectId);

  if (!highConfidence) {
    return undefined;
  }

  if (inferredDocumentType && document.documentType !== inferredDocumentType) {
    changes.push({
      field: "documentType",
      ...(document.documentType ? { before: document.documentType } : {}),
      after: inferredDocumentType
    });
  }

  if (inferredSubjectId && document.subjectId !== inferredSubjectId) {
    changes.push({
      field: "subjectId",
      ...(document.subjectId ? { before: document.subjectId } : {}),
      after: inferredSubjectId
    });
  }

  if (document.url !== canonicalUrl) {
    changes.push({
      field: "url",
      before: document.url,
      after: canonicalUrl
    });
  }

  return changes.length > 0 ? { document, changes } : undefined;
}

function inferDocumentType(
  document: DocumentRecord
): DocumentType | undefined {
  const tokens = normalizedText(document.name);

  if (
    tokens.includes("passport") ||
    tokens.includes("паспорт") ||
    tokens.includes("licna") ||
    tokens.includes("karta") ||
    tokens.includes("личная") ||
    tokens.includes("карта")
  ) {
    return "identity";
  }

  return undefined;
}

function inferSubjectId(document: DocumentRecord): string | undefined {
  const normalized = normalizedText(document.name);
  const compact = normalized.replace(/\s+/gu, "");

  if (
    normalized.includes("горяйнов") ||
    normalized.includes("goryainov ") ||
    normalized.includes("goryaynov ")
  ) {
    return "alexey";
  }

  if (
    compact.includes("goryainovava") ||
    compact.includes("goryaynovava") ||
    compact.includes("горяйновава")
  ) {
    return "victoria";
  }

  if (
    compact.includes("goryainovasa") ||
    compact.includes("goryaynovasa") ||
    compact.includes("горяйноваса")
  ) {
    return "sofia";
  }

  return undefined;
}

function applyRepairPlan(plan: RepairPlan): DocumentRecord {
  let document = plan.document;
  const updatedAt = new Date();

  for (const change of plan.changes) {
    if (change.field === "documentType") {
      document = {
        ...document,
        documentType: change.after,
        updatedAt
      };
      continue;
    }

    if (change.field === "subjectId") {
      document = {
        ...document,
        subjectId: change.after,
        updatedAt
      };
      continue;
    }

    document = {
      ...document,
      url: change.after,
      updatedAt
    };
  }

  return document;
}

function formatChanges(changes: readonly RepairChange[]): string {
  return changes.map((change) => {
    const before = formatValue(change.before);

    return `${change.field}: ${before} -> ${change.after}`;
  }).join("; ");
}

function formatValue(value: string | undefined): string {
  return value ?? "∅";
}

function formatGoogleDriveFileUrl(fileId: string): string {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}

function normalizedText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(/[čć]/gu, "c")
    .replace(/[š]/gu, "s")
    .replace(/[ž]/gu, "z")
    .replace(/[đ]/gu, "d")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function parseApplyFlag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevRepairDocuments({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
