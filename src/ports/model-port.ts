export interface ModelPort {
  runTextRequest(request: ModelTextRequest): Promise<ModelTextResponse>;
}

export interface ModelTextRequest {
  readonly purpose: string;
  readonly input: string;
}

export interface ModelTextResponse {
  readonly text: string;
}
