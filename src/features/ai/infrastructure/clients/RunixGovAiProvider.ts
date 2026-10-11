/**
 * RunixGov AI provider adapter.
 * Uses Ollama only when an explicit remote Ollama URL is configured, then
 * falls back to the server-side Gemini API for hosted environments.
 */

import { randomUUID } from 'crypto';
import { GeminiVisionProvider } from './GeminiVisionProvider';
import {
  IAiProvider,
  AiCompletionOptions,
  AiCompletionResult,
} from '../providers/IAiProvider';

type OllamaResponse = {
  response?: string;
  eval_count?: number;
  prompt_eval_count?: number;
};

export class RunixGovAiProvider implements IAiProvider {
  public readonly providerName = 'runixgov-ai';
  private readonly ollamaUrl = process.env.OLLAMA_API_URL?.trim() || null;
  private readonly modelName = process.env.OLLAMA_MODEL || 'runixgov';

  public async generateCompletion<T>(
    prompt: string,
    options?: AiCompletionOptions,
  ): Promise<AiCompletionResult<T>> {
    const localResult = await this.tryOllama<T>(prompt, options);
    if (localResult) return localResult;

    const cloudPrompt = options?.systemPrompt
      ? `${options.systemPrompt}\n\n${prompt}`
      : prompt;
    const geminiStartedAt = Date.now();
    const result = await GeminiVisionProvider.generateText(
      cloudPrompt,
      options?.maxTokens ?? 400,
      this.responseSchema(prompt),
    );
    if (!result.success || !result.text.trim()) {
      const unavailable = new Error(
        'AI text generation is unavailable. Check the server-side Gemini API configuration.',
      );
      Object.assign(unavailable, { statusCode: 503 });
      throw unavailable;
    }

    const text = this.sanitizeIdentity(result.text.trim());
    let data: unknown = { text };
    const jsonBlock = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .match(/\{[\s\S]*\}/)?.[0];
    if (jsonBlock) {
      try {
        data = JSON.parse(jsonBlock) as unknown;
      } catch {
        // Keep the readable text response for prompts that do not require JSON.
      }
    }

    const now = new Date().toISOString();
    return {
      data: data as T,
      metadata: {
        model: `gemini/${GeminiVisionProvider.modelName}`,
        provider: 'gemini-api',
        latencyMs: Date.now() - geminiStartedAt,
        promptVersion: 'v2.1-cloud-fallback',
        confidence: null,
        tokenUsage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
        },
        costEstimate: null,
        timestamp: now,
        requestId: randomUUID(),
      },
    };
  }

  private responseSchema(prompt: string): Record<string, unknown> | undefined {
    const normalized = prompt.toLowerCase();
    if (normalized.includes('assignedagent') && normalized.includes('slahours')) {
      return {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING' },
          assignedAgent: { type: 'STRING' },
          agentTitle: { type: 'STRING' },
          department: { type: 'STRING' },
          priority: { type: 'STRING' },
          slaHours: { type: 'INTEGER' },
        },
        required: ['category', 'assignedAgent', 'agentTitle', 'department', 'priority', 'slaHours'],
      };
    }
    if (normalized.includes('actionsteps') && normalized.includes('summary')) {
      return {
        type: 'OBJECT',
        properties: {
          summary: { type: 'STRING' },
          actionSteps: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['summary', 'actionSteps'],
      };
    }
    if (normalized.includes('isduplicate') && normalized.includes('similarity')) {
      return {
        type: 'OBJECT',
        properties: {
          isDuplicate: { type: 'BOOLEAN' },
          similarityScore: { type: 'NUMBER' },
          reasoning: { type: 'STRING' },
        },
        required: ['isDuplicate', 'similarityScore', 'reasoning'],
      };
    }
    return undefined;
  }

  private async tryOllama<T>(
    prompt: string,
    options?: AiCompletionOptions,
  ): Promise<AiCompletionResult<T> | null> {
    // A Netlify function does not have a local Ollama daemon. Avoid waiting on
    // localhost defaults; hosted deployments go directly to Gemini instead.
    if (!this.ollamaUrl) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12_000);
    const startTime = Date.now();
    try {
      const response = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          system: options?.systemPrompt ||
            'You are RunixGov AI, a professional public-service assistant. Return valid JSON when the prompt requests a structured result.',
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.3,
            top_p: options?.topP ?? 0.95,
            num_predict: options?.maxTokens ?? 256,
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`Ollama returned HTTP ${response.status}.`);
      }
      const body = (await response.json()) as OllamaResponse;
      const text = this.sanitizeIdentity(body.response?.trim() ?? '');
      if (!text) throw new Error('Ollama returned an empty response.');

      let data: unknown = { text };
      const jsonBlock = text.match(/\{[\s\S]*\}/)?.[0];
      if (jsonBlock) {
        try {
          data = JSON.parse(jsonBlock) as unknown;
        } catch {
          // Preserve plain text from local models.
        }
      }
      const promptTokens = body.prompt_eval_count ?? null;
      const completionTokens = body.eval_count ?? null;
      return {
        data: data as T,
        metadata: {
          model: `ollama/${this.modelName}`,
          provider: this.providerName,
          latencyMs: Date.now() - startTime,
          promptVersion: 'v2.1-local',
          confidence: null,
          tokenUsage: {
            promptTokens,
            completionTokens,
            totalTokens:
              promptTokens !== null && completionTokens !== null
                ? promptTokens + completionTokens
                : null,
          },
          costEstimate: null,
          timestamp: new Date().toISOString(),
          requestId: randomUUID(),
        },
      };
    } catch (error) {
      console.warn(
        `[RunixGovAiProvider] Configured Ollama unavailable; using Gemini fallback (${error instanceof Error ? error.message : String(error)}).`,
      );
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sanitizeIdentity(text: string): string {
    return text
      .replace(/PhiWave/gi, 'RunixGov AI')
      .replace(/Phi-3/gi, 'RunixGov AI')
      .replace(/Phi 3/gi, 'RunixGov AI')
      .replace(/Microsoft/gi, 'Runix Tech Lab')
      .replace(/<\|[^|>]+\|>/g, '')
      .trim();
  }
}
