import type {
  PendingChoiceClassifier,
  PendingChoiceOption
} from "./classify-pending-choice.js";
import type { LayerResult, ResolutionLayer } from "./escalation-ladder.js";
import { escalate, resolved, unresolved } from "./escalation-ladder.js";

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

interface PendingChoiceContext<TChoice extends string> {
  readonly prompt: string;
  readonly userReply: string;
  readonly options: readonly PendingChoiceOption<TChoice>[];
}

export function allowsFreeFormPendingInterruption(
  policy: PendingDecisionPolicy
): boolean {
  return policy === "safe_interruptible";
}

/**
 * Rung 1: deterministic dictionary parse of the user's reply.
 */
export function deterministicChoiceLayer<TChoice extends string>(
  parse: (text: string) => TChoice | undefined
): ResolutionLayer<PendingChoiceContext<TChoice>, TChoice> {
  return {
    name: "dictionary",
    attempt(context): LayerResult<TChoice> {
      const choice = parse(context.userReply);

      return choice === undefined ? unresolved : resolved(choice);
    }
  };
}

/**
 * Rung 2: model classification over the known choice options. A classifier
 * failure resolves to nothing so the ladder can fall through.
 */
export function modelChoiceLayer<TChoice extends string>(
  classifier: PendingChoiceClassifier<TChoice>
): ResolutionLayer<PendingChoiceContext<TChoice>, TChoice> {
  return {
    name: "model_choice",
    async attempt(context): Promise<LayerResult<TChoice>> {
      try {
        const choice = await classifier.execute({
          prompt: context.prompt,
          userReply: context.userReply,
          options: context.options
        });

        return choice === undefined ? unresolved : resolved(choice);
      } catch {
        return unresolved;
      }
    }
  };
}

export async function resolvePendingDecision<TChoice extends string>(
  input: ResolvePendingDecisionInput<TChoice>
): Promise<TChoice | undefined> {
  const layers: ResolutionLayer<PendingChoiceContext<TChoice>, TChoice>[] = [
    deterministicChoiceLayer(input.parseDeterministicChoice)
  ];

  if (input.classifier) {
    layers.push(modelChoiceLayer(input.classifier));
  }

  const outcome = await escalate<PendingChoiceContext<TChoice>, TChoice>(
    {
      prompt: input.prompt,
      userReply: input.userReply,
      options: input.options
    },
    layers
  );

  return outcome?.value;
}
