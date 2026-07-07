import type { FamilyFact } from "../core/domain/family-memory/family-fact.js";

export interface FamilyMemoryRepositoryPort {
  saveFamilyFact(fact: FamilyFact): Promise<void>;
  listRecentActiveFamilyFacts(limit: number): Promise<readonly FamilyFact[]>;
}
