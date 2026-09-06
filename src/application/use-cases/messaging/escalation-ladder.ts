// Unified "escalation ladder" primitive (DC-ARCH-001).
//
// Control is handed to progressively more capable (and more expensive) layers
// only when the previous layer fails to resolve. The canonical rungs are:
//   1. a deterministic dictionary parse,
//   2. a model classification over a known set of choices ("yes/no"-style),
//   3. a full model intent classification ("what does the user actually want").
// Each concrete feature declares which rungs it uses; this module owns the
// ordering and short-circuit logic so it is not duplicated per handler.

export type LayerResult<TValue> =
  | { readonly resolved: true; readonly value: TValue }
  | { readonly resolved: false };

export interface ResolutionLayer<TContext, TValue> {
  /** Stable label for observability/routing events. */
  readonly name: string;
  attempt(
    context: TContext
  ): Promise<LayerResult<TValue>> | LayerResult<TValue>;
}

export interface EscalationOutcome<TValue> {
  readonly value: TValue;
  /** Name of the layer that resolved the request. */
  readonly layer: string;
}

/**
 * Try each layer in order and return the first resolution, or `undefined` if no
 * layer resolves the request.
 */
export async function escalate<TContext, TValue>(
  context: TContext,
  layers: readonly ResolutionLayer<TContext, TValue>[]
): Promise<EscalationOutcome<TValue> | undefined> {
  for (const layer of layers) {
    const result = await layer.attempt(context);

    if (result.resolved) {
      return { value: result.value, layer: layer.name };
    }
  }

  return undefined;
}

export function resolved<TValue>(value: TValue): LayerResult<TValue> {
  return { resolved: true, value };
}

export const unresolved: LayerResult<never> = { resolved: false };
