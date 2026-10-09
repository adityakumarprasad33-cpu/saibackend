/**
 * AI Provider Abstraction Interface Contract & Mock Adapter
 */

export interface AiCompletionOptions {
  temperature?: number | undefined;
  topP?: number | undefined;
  maxTokens?: number | undefined;
  systemPrompt?: string | undefined;
  rawPrompt?: string | undefined;
}

export interface AiResponseMetadata {
  model: string;
  provider: string;
  latencyMs: number;
  promptVersion: string;
  confidence: number | null;
  tokenUsage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  costEstimate: number | null;
  timestamp: string;
  requestId: string;
}

export interface AiCompletionResult<T = unknown> {
  data: T;
  metadata: AiResponseMetadata;
}

export interface IAiProvider {
  providerName: string;
  generateCompletion<T>(prompt: string, options?: AiCompletionOptions): Promise<AiCompletionResult<T>>;
}
