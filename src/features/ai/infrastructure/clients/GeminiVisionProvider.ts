/**
 * GeminiVisionProvider
 *
 * Cloud fallback AI provider using Google Gemini 2.0 Flash multimodal API.
 * Used when local Ollama moondream vision model is unavailable/offline.
 * Accepts base64-encoded images and returns structured civic defect analysis.
 */

export interface GeminiVisionResult {
  visualDescription: string;
  success: boolean;
}

export interface GeminiTextResult {
  text: string;
  success: boolean;
}

export class GeminiVisionProvider {
  private static get geminiApiKey(): string {
    // Firebase client keys identify Firebase clients; they are not a substitute
    // for explicitly configured Gemini API access.
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  }
  private static get GEMINI_MODEL(): string {
    return process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  }
  private static get thinkingLevel(): string {
    const level = process.env.GEMINI_THINKING_LEVEL;
    return level && ['minimal', 'low', 'medium', 'high'].includes(level) ? level : 'minimal';
  }
  private static readonly GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

  /**
   * Analyze an image using Gemini Vision multimodal API.
   * Sends base64-encoded image with a civic defect analysis prompt.
   */
  public static async analyzeImage(
    base64Data: string,
    promptText?: string,
    declaredMimeType?: string,
  ): Promise<GeminiVisionResult> {
    const key = this.geminiApiKey;
    if (!key) {
      console.warn('[GeminiVisionProvider] GEMINI_API_KEY is not configured. Skipping Gemini Vision.');
      return { visualDescription: '', success: false };
    }

    const dataUrlMimeType = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(base64Data)?.[1];
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').trim();
    const mimeType = this.resolveImageMimeType(
      cleanBase64,
      dataUrlMimeType ?? declaredMimeType,
    );
    if (!mimeType) {
      console.warn('[GeminiVisionProvider] Unsupported or unknown image format.');
      return { visualDescription: '', success: false };
    }

    const url = `${this.GEMINI_BASE_URL}/${this.GEMINI_MODEL}:generateContent`;
    const prompt = promptText || 
      'Examine this photo of a civic or municipal issue in India. Identify the specific infrastructure defect visible — pothole, road crack, water pipe leak, garbage dump, electrical wire damage, drainage overflow, broken streetlight, etc. Describe the defect clearly and concisely in 2-3 sentences. Focus on what is visually wrong and the safety hazard it presents.';

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: cleanBase64,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: 300,
        thinkingConfig: { thinkingLevel: this.thinkingLevel },
      },
    };

    try {
      console.log(`[GeminiVisionProvider] Sending image (${cleanBase64.length} chars) to Gemini ${this.GEMINI_MODEL}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const resData = (await response.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string; thought?: boolean }>;
            };
          }>;
        };

        const text = resData.candidates?.[0]?.content?.parts
          ?.filter(part => part.thought !== true)
          .map(part => part.text || '')
          .join('\n')
          .trim() || '';
        if (text.length > 10) {
          console.log(`[GeminiVisionProvider] Gemini Vision output: "${text.substring(0, 120)}..."`);
          return { visualDescription: text, success: true };
        }
      } else {
        const errText = await response.text();
        console.warn(`[GeminiVisionProvider] Gemini API error ${response.status}: ${errText.substring(0, 200)}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[GeminiVisionProvider] Gemini Vision call failed (${msg}).`);
    }

    return { visualDescription: '', success: false };
  }

  private static resolveImageMimeType(base64Data: string, declaredMimeType?: string): string | null {
    // Detect common formats from their file signatures. Flutter web/mobile can
    // return PNG or WebP as well as JPEG, so never label every payload JPEG.
    if (base64Data.startsWith('/9j/')) return 'image/jpeg';
    if (base64Data.startsWith('iVBORw0KGgo')) return 'image/png';
    if (base64Data.startsWith('UklGR')) return 'image/webp';
    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ]);
    const normalized = declaredMimeType
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    return normalized && allowed.has(normalized) ? normalized : null;
  }

  /**
   * Generate text using Gemini text model (no image).
   * Used as fallback for title generation and description synthesis.
   */
  public static async generateText(
    prompt: string,
    maxTokens = 300,
    responseSchema?: Record<string, unknown>,
  ): Promise<GeminiTextResult> {
    const key = this.geminiApiKey;
    if (!key) {
      return { text: '', success: false };
    }

    const url = `${this.GEMINI_BASE_URL}/${this.GEMINI_MODEL}:generateContent`;

    const payload = {
      contents: [{
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingLevel: this.thinkingLevel },
        ...(responseSchema
          ? { responseMimeType: 'application/json', responseSchema }
          : {}),
      },
    };

    try {
      console.log(`[GeminiVisionProvider] Prompting Gemini ${this.GEMINI_MODEL} text model...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const resData = (await response.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string; thought?: boolean }>;
            };
          }>;
        };

        const text = resData.candidates?.[0]?.content?.parts
          ?.filter(part => part.thought !== true)
          .map(part => part.text || '')
          .join('\n')
          .trim() || '';
        if (text.length > 10) {
          console.log(`[GeminiVisionProvider] Gemini text output received (${text.length} chars).`);
          return { text, success: true };
        }
        console.warn('[GeminiVisionProvider] Text model returned no usable text.');
      } else {
        const errText = await response.text();
        console.warn(`[GeminiVisionProvider] Gemini text API error ${response.status}: ${errText.substring(0, 200)}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[GeminiVisionProvider] Gemini text call failed (${msg}).`);
    }

    return { text: '', success: false };
  }
}
