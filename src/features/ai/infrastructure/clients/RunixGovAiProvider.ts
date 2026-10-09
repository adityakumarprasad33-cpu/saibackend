/**
 * Self-Hosted 'RunixGov AI' Local GGUF LLM Provider Adapter
 * Connects to local Ollama API (http://localhost:11434) running model 'runixgov'
 */

import { IAiProvider, AiCompletionOptions, AiCompletionResult } from '../providers/IAiProvider';
import { randomUUID } from 'crypto';

export class RunixGovAiProvider implements IAiProvider {
  public readonly providerName = 'runixgov-local-llm';
  private readonly ollamaUrl: string = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
  private readonly modelName: string = process.env.OLLAMA_MODEL || 'runixgov';

  public async generateCompletion<T>(prompt: string, options?: AiCompletionOptions): Promise<AiCompletionResult<T>> {
    const startTime = Date.now();

    try {
      const payload: Record<string, unknown> = {
        model: this.modelName,
        prompt: prompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.3,
          top_p: options?.topP ?? 0.95,
          num_predict: options?.maxTokens ?? 256,
        },
      };

      const baseCompanySystem = `You are RunixGov AI, a friendly and professional public service AI assistant developed by Runix Tech Lab (https://runix.in) for SamadhanAI.

STRICT CONVERSATION RULES:
1. Speak directly, warmly, and helpfully to the citizen.
2. NEVER regurgitate internal prompt rules, meta-instructions, category codes, or intent analysis steps.
3. Creator: Created by Runix Tech Lab (Runix Web Technologies, https://runix.in, hello@runixtech.com).
4. General Knowledge: Answer all general questions, history, science, and trivia accurately.
5. Filing Complaints: Guide citizens clearly to file complaints using the 'Lodge Grievance' screen in the app.`;

      payload.system = options?.systemPrompt
        ? `${baseCompanySystem}\n\nAdditional Role Context: ${options.systemPrompt}`
        : baseCompanySystem;

      const response = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const resData = (await response.json()) as {
        response?: string;
        eval_count?: number;
        prompt_eval_count?: number;
      };

      const rawText = this.sanitizeIdentity((resData.response || '').trim());
      if (!rawText) throw new Error('Ollama returned an empty response.');
      let parsedData: unknown;

      // Attempt parsing JSON output from GGUF model
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const rawObj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
          parsedData = rawObj;
        } else {
          parsedData = { text: rawText };
        }
      } catch {
        parsedData = { text: rawText };
      }

      const latencyMs = Date.now() - startTime;
      const promptTokens = typeof resData.prompt_eval_count === 'number' ? resData.prompt_eval_count : null;
      const completionTokens = typeof resData.eval_count === 'number' ? resData.eval_count : null;

      return {
        data: parsedData as T,
        metadata: {
          model: `ollama/${this.modelName}`,
          provider: this.providerName,
          latencyMs,
          promptVersion: 'v2.0-custom',
          confidence: null,
          tokenUsage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null,
          },
          costEstimate: null,
          timestamp: new Date().toISOString(),
          requestId: randomUUID(),
        },
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[RunixGovAiProvider] Ollama request failed: ${errorMessage}`);
      const unavailable = new Error('AI provider is unavailable.');
      Object.assign(unavailable, { statusCode: 503 });
      throw unavailable;
    }
  }

  private sanitizeIdentity(text: string): string {
    if (!text) return text;
    let cleaned = text;
    cleaned = cleaned.replace(/PhiWave/gi, 'RunixGov AI');
    cleaned = cleaned.replace(/Phi-3/gi, 'RunixGov AI');
    cleaned = cleaned.replace(/Phi 3/gi, 'RunixGov AI');
    cleaned = cleaned.replace(/Phi wave/gi, 'RunixGov AI');
    cleaned = cleaned.replace(/Microsoft/gi, 'Runix Tech Lab');

    // Remove any special prompt token tags
    cleaned = cleaned.replace(/<\|[^|>]+\|>/g, '');

    // Truncate trailing meta-prompt spillovers
    const part1 = cleaned.split(/Problem:\s*You are/i)[0];
    if (part1) cleaned = part1;
    const part2 = cleaned.split(/AnalytiBot/i)[0];
    if (part2) cleaned = part2;

    // Remove meta-prompt regurgitations if model output internal rules
    cleaned = cleaned.replace(/As a Government Complaint Platform agent, your primary directive is[^\n]*\n?/gi, '');
    cleaned = cleaned.replace(/1\.\s*Analyze Citizen Query Intent:[^\n]*\n?/gi, '');
    cleaned = cleaned.replace(/Determine intent as "[^"]*"/gi, '');
    return cleaned.trim();
  }
}
