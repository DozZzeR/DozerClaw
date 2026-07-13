import { normalizeSubjectId } from "../../../core/domain/family-memory/subject-id.js";
import type {
  SubjectAlias,
  SubjectAliasRepositoryPort
} from "../../../ports/subject-alias-repository-port.js";

export type ManageSubjectAliasesInput =
  | {
      readonly action: "save";
      readonly aliasSubjectId?: string;
      readonly canonicalSubjectId?: string;
    }
  | {
      readonly action: "list";
    }
  | {
      readonly action: "delete";
      readonly aliasSubjectId?: string;
    }
  | {
      readonly action: "diagnose";
    };

export interface ManageSubjectAliasesResult {
  readonly text: string;
}

export class ManageSubjectAliasesUseCase {
  constructor(
    private readonly dependencies: {
      readonly repository: SubjectAliasRepositoryPort;
    }
  ) {}

  async execute(
    input: ManageSubjectAliasesInput
  ): Promise<ManageSubjectAliasesResult> {
    if (input.action === "save") {
      return this.save(input.aliasSubjectId, input.canonicalSubjectId);
    }

    if (input.action === "delete") {
      return this.delete(input.aliasSubjectId);
    }

    const aliases = await this.dependencies.repository.listSubjectAliases();

    if (input.action === "diagnose") {
      return {
        text: formatAliasDiagnostics(aliases)
      };
    }

    return {
      text: formatAliasList(aliases)
    };
  }

  private async save(
    aliasSubjectId: string | undefined,
    canonicalSubjectId: string | undefined
  ): Promise<ManageSubjectAliasesResult> {
    const normalizedAlias = normalizeSubjectId(aliasSubjectId);
    const normalizedCanonical = normalizeSubjectId(canonicalSubjectId);

    if (!normalizedAlias || !normalizedCanonical) {
      return {
        text: "I need both an alias subject and a canonical subject."
      };
    }

    await this.dependencies.repository.saveSubjectAlias({
      aliasSubjectId: normalizedAlias,
      canonicalSubjectId: normalizedCanonical
    });

    return {
      text: `Saved subject alias: ${normalizedAlias} -> ${normalizedCanonical}`
    };
  }

  private async delete(
    aliasSubjectId: string | undefined
  ): Promise<ManageSubjectAliasesResult> {
    const normalizedAlias = normalizeSubjectId(aliasSubjectId);

    if (!normalizedAlias) {
      return {
        text: "I need an alias subject to delete."
      };
    }

    const deleted =
      await this.dependencies.repository.deleteSubjectAlias(normalizedAlias);

    return {
      text: deleted
        ? `Deleted subject alias: ${normalizedAlias}`
        : `Subject alias not found: ${normalizedAlias}`
    };
  }
}

function formatAliasList(aliases: readonly SubjectAlias[]): string {
  if (aliases.length === 0) {
    return "Subject aliases: none";
  }

  return [
    "Subject aliases:",
    ...aliases.map(
      (alias) => `- ${alias.aliasSubjectId} -> ${alias.canonicalSubjectId}`
    )
  ].join("\n");
}

function formatAliasDiagnostics(aliases: readonly SubjectAlias[]): string {
  if (aliases.length === 0) {
    return "Subject alias diagnostics: no aliases configured.";
  }

  const canonicalByAlias = new Map(
    aliases.map((alias) => [alias.aliasSubjectId, alias.canonicalSubjectId])
  );
  const chains = aliases
    .map((alias) => {
      const nextCanonical = canonicalByAlias.get(alias.canonicalSubjectId);

      if (!nextCanonical) {
        return undefined;
      }

      return `- chain: ${alias.aliasSubjectId} -> ${alias.canonicalSubjectId} -> ${nextCanonical}`;
    })
    .filter((line): line is string => Boolean(line));

  if (chains.length === 0) {
    return "Subject alias diagnostics: OK";
  }

  return ["Subject alias diagnostics:", ...chains].join("\n");
}
