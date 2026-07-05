export interface ModelPort {
  runTextRequest(request: ModelTextRequest): Promise<ModelTextResponse>;
}

export interface ModelTextRequest {
  readonly purpose: string;
  readonly input: string;
  readonly outputSchema?: ModelOutputSchema;
}

export interface ModelTextResponse {
  readonly text: string;
}

export interface ModelOutputSchema {
  readonly name: string;
  readonly schema: Record<string, unknown>;
}
