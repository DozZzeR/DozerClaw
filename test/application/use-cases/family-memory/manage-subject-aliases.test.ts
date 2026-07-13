import { describe, expect, it } from "vitest";

import { ManageSubjectAliasesUseCase } from "../../../../src/application/use-cases/family-memory/manage-subject-aliases.js";
import type {
  SubjectAlias,
  SubjectAliasInput,
  SubjectAliasRepositoryPort
} from "../../../../src/ports/subject-alias-repository-port.js";

describe("ManageSubjectAliasesUseCase", () => {
  it("saves a normalized subject alias", async () => {
    const repository = new FakeSubjectAliasRepository();
    const useCase = new ManageSubjectAliasesUseCase({ repository });

    await expect(
      useCase.execute({
        action: "save",
        aliasSubjectId: "  Child: Maksim  ",
        canonicalSubjectId: "Max"
      })
    ).resolves.toEqual({
      text: "Saved subject alias: maksim -> max"
    });
    expect(repository.saved).toEqual({
      aliasSubjectId: "maksim",
      canonicalSubjectId: "max"
    });
  });

  it("rejects empty normalized alias inputs", async () => {
    const repository = new FakeSubjectAliasRepository();
    const useCase = new ManageSubjectAliasesUseCase({ repository });

    await expect(
      useCase.execute({
        action: "save",
        aliasSubjectId: " : -- ",
        canonicalSubjectId: "max"
      })
    ).resolves.toEqual({
      text: "I need both an alias subject and a canonical subject."
    });
    expect(repository.saved).toBeUndefined();
  });

  it("lists configured aliases", async () => {
    const useCase = new ManageSubjectAliasesUseCase({
      repository: new FakeSubjectAliasRepository([
        {
          aliasSubjectId: "maksim",
          canonicalSubjectId: "max"
        },
        {
          aliasSubjectId: "sonechka",
          canonicalSubjectId: "sofia"
        }
      ])
    });

    await expect(
      useCase.execute({
        action: "list"
      })
    ).resolves.toEqual({
      text: ["Subject aliases:", "- maksim -> max", "- sonechka -> sofia"].join(
        "\n"
      )
    });
  });

  it("deletes a normalized alias", async () => {
    const repository = new FakeSubjectAliasRepository([
      {
        aliasSubjectId: "maksim",
        canonicalSubjectId: "max"
      }
    ]);
    const useCase = new ManageSubjectAliasesUseCase({ repository });

    await expect(
      useCase.execute({
        action: "delete",
        aliasSubjectId: "Person/Maksim"
      })
    ).resolves.toEqual({
      text: "Deleted subject alias: maksim"
    });
  });

  it("diagnoses alias chains", async () => {
    const useCase = new ManageSubjectAliasesUseCase({
      repository: new FakeSubjectAliasRepository([
        {
          aliasSubjectId: "maksim",
          canonicalSubjectId: "max"
        },
        {
          aliasSubjectId: "max",
          canonicalSubjectId: "maxim"
        }
      ])
    });

    await expect(
      useCase.execute({
        action: "diagnose"
      })
    ).resolves.toEqual({
      text: [
        "Subject alias diagnostics:",
        "- chain: maksim -> max -> maxim"
      ].join("\n")
    });
  });
});

class FakeSubjectAliasRepository implements SubjectAliasRepositoryPort {
  saved: SubjectAliasInput | undefined;

  constructor(private aliases: SubjectAlias[] = []) {}

  async resolveCanonicalSubjectId(subjectId: string): Promise<string> {
    return (
      this.aliases.find((alias) => alias.aliasSubjectId === subjectId)
        ?.canonicalSubjectId ?? subjectId
    );
  }

  async saveSubjectAlias(input: SubjectAliasInput): Promise<void> {
    this.saved = input;
    this.aliases = [
      ...this.aliases.filter(
        (alias) => alias.aliasSubjectId !== input.aliasSubjectId
      ),
      input
    ];
  }

  async listSubjectAliases(): Promise<readonly SubjectAlias[]> {
    return this.aliases;
  }

  async deleteSubjectAlias(aliasSubjectId: string): Promise<boolean> {
    const before = this.aliases.length;
    this.aliases = this.aliases.filter(
      (alias) => alias.aliasSubjectId !== aliasSubjectId
    );

    return this.aliases.length !== before;
  }
}
