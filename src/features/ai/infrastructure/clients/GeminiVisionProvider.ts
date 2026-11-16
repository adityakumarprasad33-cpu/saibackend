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

export interface GeminiCivicDefectAnalysis {
  visualDescription: string;
  defectCategory: string;
  defectType: string;
  titles: string[];
  description: string;
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
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    return key.replace(/^['"]|['"]$/g, '').trim();
  }
  private static get GEMINI_MODEL(): string {
    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    return model.replace(/^['"]|['"]$/g, '').trim();
  }
  public static get modelName(): string {
    return this.GEMINI_MODEL;
  }
  private static readonly FALLBACK_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ];
  private static get thinkingLevel(): string | undefined {
    const level = (process.env.GEMINI_THINKING_LEVEL || '').replace(/^['"]|['"]$/g, '').trim().toLowerCase();
    return level && ['minimal', 'low', 'medium', 'high'].includes(level) ? level : undefined;
  }
  private static readonly GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

  /**
   * Unified single-roundtrip multimodal analysis.
   * Examines image, classifies defect category, generates 4 titles, and synthesizes grievance description in ~2 seconds.
   */
  public static async analyzeCivicDefect(
    base64Data: string,
    declaredMimeType?: string,
    district?: string,
    stateCode?: string,
  ): Promise<GeminiCivicDefectAnalysis> {
    const key = this.geminiApiKey;
    if (!key) {
      console.warn('[GeminiVisionProvider] GEMINI_API_KEY is not configured. Skipping Gemini Vision.');
      return { visualDescription: '', defectCategory: 'roads', defectType: 'road_infrastructure_damage', titles: [], description: '', success: false };
    }

    const dataUrlMimeType = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(base64Data)?.[1];
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').trim();
    const mimeType = this.resolveImageMimeType(
      cleanBase64,
      dataUrlMimeType ?? declaredMimeType,
    );
    if (!mimeType) {
      console.warn('[GeminiVisionProvider] Unsupported or unknown image format.');
      return { visualDescription: '', defectCategory: 'roads', defectType: 'road_infrastructure_damage', titles: [], description: '', success: false };
    }

    const cleanDistrict = district || 'Central Delhi';
    const cleanState = stateCode || 'DL';

    const prompt = `You are SamadhanAI, India's Pan-India citizen grievance municipal intelligence system.
Analyze this photo of a civic infrastructure issue captured by a citizen in ${cleanDistrict}, ${cleanState}, India.
Identify what is visually damaged, hazardous, or in disrepair.

Return a JSON object with:
1. "visualDescription": 2-3 sentences describing exactly what is visible in the photo and the safety hazard it presents.
2. "defectCategory": Exactly one of: "roads", "water", "electricity", "sanitation", "traffic".
   (Rule: If the defect is a pothole, crater, road crack, asphalt damage, or pavement cavity, even if it contains rain water or puddles, classify it under "roads").
3. "defectType": Specific defect code: "road_infrastructure_damage" (potholes/roads), "water_pipeline_issue" (pipe leaks/drain overflow), "electrical_hazard" (loose wires/damaged poles/blackout), "garbage_overflow" (garbage dumps/trash), or "traffic_safety_issue" (signals/congestion).
4. "titles": Exactly 4 distinct, formal complaint titles under 8 words each suitable for municipal grievance registration.
5. "description": A concise, formal citizen grievance description (3-4 sentences) explaining the visible hazard and requesting departmental inspection and repair within SLA.`;

    const schema = {
      type: 'OBJECT',
      properties: {
        visualDescription: { type: 'STRING' },
        defectCategory: { type: 'STRING' },
        defectType: { type: 'STRING' },
        titles: { type: 'ARRAY', items: { type: 'STRING' } },
        description: { type: 'STRING' },
      },
      required: ['visualDescription', 'defectCategory', 'defectType', 'titles', 'description'],
    };

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
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 900,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    };

    const modelsToTry = [
      this.GEMINI_MODEL,
      ...this.FALLBACK_MODELS.filter(m => m !== this.GEMINI_MODEL),
    ];

    for (const model of modelsToTry) {
      const url = `${this.GEMINI_BASE_URL}/${model}:generateContent`;
      try {
        console.log(`[GeminiVisionProvider] Sending single-call multimodal analysis (${cleanBase64.length} chars) to Gemini ${model}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

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

          const rawText = resData.candidates?.[0]?.content?.parts
            ?.filter(part => part.thought !== true)
            .map(part => part.text || '')
            .join('\n')
            .trim() || '';

          const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          if (jsonText.length > 20) {
            try {
              const parsed = JSON.parse(jsonText);
              const visualDescription = typeof parsed.visualDescription === 'string' ? parsed.visualDescription.trim() : '';
              const defectCategory = typeof parsed.defectCategory === 'string' ? parsed.defectCategory.toLowerCase().trim() : 'roads';
              const defectType = typeof parsed.defectType === 'string' ? parsed.defectType.trim() : 'road_infrastructure_damage';
              const titles = Array.isArray(parsed.titles) ? parsed.titles.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 3) : [];
              const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';

              if (visualDescription.length > 10 && titles.length >= 3 && description.length > 20) {
                console.log(`[GeminiVisionProvider] Gemini multimodal (${model}) parsed defect: ${defectCategory} / ${defectType}`);
                return {
                  visualDescription,
                  defectCategory,
                  defectType,
                  titles: titles.slice(0, 4),
                  description,
                  success: true,
                };
              }
            } catch (parseErr) {
              console.warn(`[GeminiVisionProvider] JSON parse error on ${model} output: ${parseErr}`);
            }
          }
        } else {
          const errText = await response.text();
          console.warn(`[GeminiVisionProvider] Gemini API error ${response.status} on model ${model}: ${errText.substring(0, 150)}`);
          continue;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[GeminiVisionProvider] Gemini multimodal call on ${model} failed (${msg}).`);
      }
    }

    return { visualDescription: '', defectCategory: 'roads', defectType: 'road_infrastructure_damage', titles: [], description: '', success: false };
  }

  /**
   * Analyze an image using Gemini Vision multimodal API.
   * Sends base64-encoded image with a civic defect analysis prompt.
   * Employs model fallback chain if primary model experiences demand spikes.
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
        maxOutputTokens: 600,
        ...(this.thinkingLevel ? { thinkingConfig: { thinkingLevel: this.thinkingLevel } } : {}),
      },
    };

    const modelsToTry = [
      this.GEMINI_MODEL,
      ...this.FALLBACK_MODELS.filter(m => m !== this.GEMINI_MODEL),
    ];

    for (const model of modelsToTry) {
      const url = `${this.GEMINI_BASE_URL}/${model}:generateContent`;
      try {
        console.log(`[GeminiVisionProvider] Sending image (${cleanBase64.length} chars) to Gemini ${model}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

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
            console.log(`[GeminiVisionProvider] Gemini Vision (${model}) output: "${text.substring(0, 120)}..."`);
            return { visualDescription: text, success: true };
          }
        } else {
          const errText = await response.text();
          console.warn(`[GeminiVisionProvider] Gemini API error ${response.status} on model ${model}: ${errText.substring(0, 150)}`);
          continue; // Fall through to next model candidate
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[GeminiVisionProvider] Gemini Vision call on ${model} failed (${msg}).`);
      }
    }

    return { visualDescription: '', success: false };
  }

  private static resolveImageMimeType(base64Data: string, declaredMimeType?: string): string {
    const clean = base64Data.trim();
    if (clean.startsWith('/9j/')) return 'image/jpeg';
    if (clean.startsWith('iVBORw0KGgo')) return 'image/png';
    if (clean.startsWith('UklGR')) return 'image/webp';
    const allowed: Record<string, string> = {
      'image/jpeg': 'image/jpeg',
      'image/jpg': 'image/jpeg',
      'image/png': 'image/png',
      'image/webp': 'image/webp',
      'image/heic': 'image/heic',
      'image/heif': 'image/heif',
    };
    const normalized = declaredMimeType
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (normalized && allowed[normalized]) {
      return allowed[normalized];
    }
    return 'image/jpeg';
  }

  /**
   * Generate text using Gemini text model (no image).
   * Used as fallback for title generation and description synthesis.
   * Employs model fallback chain if primary model experiences demand spikes.
   */
  public static async generateText(
    prompt: string,
    maxTokens = 600,
    responseSchema?: Record<string, unknown>,
  ): Promise<GeminiTextResult> {
    const key = this.geminiApiKey;
    if (!key) {
      return { text: '', success: false };
    }

    const payload = {
      contents: [{
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: maxTokens,
        ...(this.thinkingLevel ? { thinkingConfig: { thinkingLevel: this.thinkingLevel } } : {}),
        ...(responseSchema
          ? { responseMimeType: 'application/json', responseSchema }
          : {}),
      },
    };

    const modelsToTry = [
      this.GEMINI_MODEL,
      ...this.FALLBACK_MODELS.filter(m => m !== this.GEMINI_MODEL),
    ];

    for (const model of modelsToTry) {
      const url = `${this.GEMINI_BASE_URL}/${model}:generateContent`;
      try {
        console.log(`[GeminiVisionProvider] Prompting Gemini ${model} text model...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

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
            console.log(`[GeminiVisionProvider] Gemini text (${model}) output received (${text.length} chars).`);
            return { text, success: true };
          }
          console.warn(`[GeminiVisionProvider] Text model ${model} returned no usable text.`);
        } else {
          const errText = await response.text();
          console.warn(`[GeminiVisionProvider] Gemini text API error ${response.status} on model ${model}: ${errText.substring(0, 150)}`);
          continue; // Fall through to next model candidate
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[GeminiVisionProvider] Gemini text call on ${model} failed (${msg}).`);
      }
    }

    return { text: '', success: false };
  }
}
