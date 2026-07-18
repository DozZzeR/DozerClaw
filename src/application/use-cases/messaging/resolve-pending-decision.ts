import type {
  PendingChoiceClassifier,
  PendingChoiceOption
} from "./classify-pending-choice.js";

export type PendingDecisionPolicy =
  | "safe_interruptible"
  | "choice_only"
  | "destructive_choice_only"
  | "access_choice_only";

export interface ResolvePendingDecisionInput<TChoice extends string> {
  readonly policy: PendingDecisionPolicy;
  readonly prompt: string;
  readonly userReply: string;
  readonly options: readonly PendingChoiceOption<TChoice>[];
  readonly parseDeterministicChoice: (text: string) => TChoice | undefined;
  readonly classifier?: PendingChoiceClassifier<TChoice> | undefined;
}

export function allowsFreeFormPendingInterruption(
  policy: PendingDecisionPolicy
): boolean {
  return policy === "safe_interruptible";
}

export async function resolvePendingDecision<TChoice extends string>(
  input: ResolvePendingDecisionInput<TChoice>
): Promise<TChoice | undefined> {
  const deterministicChoice = input.parseDeterministicChoice(input.userReply);

  if (deterministicChoice !== undefined) {
    return deterministicChoice;
  }

  if (!input.classifier) {
    return undefined;
  }

  try {
    return await input.classifier.execute({
      prompt: input.prompt,
      userReply: input.userReply,
      options: input.options
    });
  } catch {
    return undefined;
  }
}
