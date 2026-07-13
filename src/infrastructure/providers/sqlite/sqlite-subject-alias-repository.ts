import type {
  SubjectAliasInput,
  SubjectAliasRepositoryPort
} from "../../../ports/subject-alias-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

interface SubjectAliasRow {
  readonly canonical_subject_id: string;
}

export class SqliteSubjectAliasRepository
  implements SubjectAliasRepositoryPort
{
  constructor(private readonly database: SqliteDatabase) {}

  async resolveCanonicalSubjectId(subjectId: string): Promise<string> {
    const row = this.database
      .prepare(
        `
          select canonical_subject_id
          from family_subject_aliases
          where alias_subject_id = ?
        `
      )
      .get(subjectId) as SubjectAliasRow | undefined;

    return row?.canonical_subject_id ?? subjectId;
  }

  async saveSubjectAlias(input: SubjectAliasInput): Promise<void> {
    this.database
      .prepare(
        `
          insert into family_subject_aliases (
            alias_subject_id,
            canonical_subject_id
          )
          values (
            @aliasSubjectId,
            @canonicalSubjectId
          )
          on conflict(alias_subject_id) do update set
            canonical_subject_id = excluded.canonical_subject_id
        `
      )
      .run(input);
  }
}
