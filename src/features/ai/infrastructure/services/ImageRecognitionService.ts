/**
 * ImageRecognitionService — Production Pan-India Pipeline
 *
 * Three-stage AI pipeline for civic defect recognition:
 * 1. Visual Analysis: Ollama moondream (local GPU/CPU) → Gemini Vision (cloud fallback)
 * 2. Text Synthesis: Ollama runixgov (local LLM) → Gemini text (cloud fallback)
 * 3. Department Routing: PanIndiaDepartmentRegistry (dynamic state-wise assignment)
 *
 * NO hardcoded Bihar/Patna references. All routing is driven by citizen's stateCode.
 */

import { GeminiVisionProvider } from '../clients/GeminiVisionProvider';
import { PanIndiaDepartmentRegistry } from '../../domain/services/PanIndiaDepartmentRegistry';

export interface ImageAnalysisPayload {
  fileName?: string;
  imagePath?: string;
  mimeType?: string;
  base64Data?: string;
  defectHint?: string;
  district?: string;
  stateCode?: string;
}

export interface ImageAnalysisResponse {
  imageDescription: string;
  suggestedTitles: string[];
  autoDescription: string;
  detectedDefectType: string;
  classification: {
    category: string;
    assignedAgent: string;
    agentTitle: string;
    department: string;
    slaHours: number;
    priority: string;
    confidenceScore: number | null;
    provider: string;
  };
}

interface GeneratedGrievanceDraft {
  titles: string[];
  description: string;
}

function parseGrievanceDraft(value: string): GeneratedGrievanceDraft | null {
  const unfenced = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed: unknown = JSON.parse(unfenced);
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const titles = Array.isArray(record.titles)
        ? record.titles
            .filter((title): title is string => typeof title === 'string')
            .map(title => title.trim())
            .filter(Boolean)
        : [];
      const description = typeof record.description === 'string' ? record.description.trim() : '';
      if (titles.length >= 3 && description.length >= 20) {
        return { titles: titles.slice(0, 4), description };
      }
    }
  } catch {
    // Ollama may return plain text; parse the compatible legacy format below.
  }

  const descriptionMarker = /(?:detailed\s+)?description\s*:\s*/i.exec(value);
  const titleText = descriptionMarker ? value.slice(0, descriptionMarker.index) : value;
  const description = descriptionMarker
    ? value.slice(descriptionMarker.index + descriptionMarker[0].length).trim()
    : value
        .split(/\n\s*\n/)
        .map(part => part.trim())
        .filter(part => part.length >= 60)
        .sort((a, b) => b.length - a.length)[0] ?? '';
  const titles = titleText
    .split(/[\r\n]+/)
    .map(line => line.replace(/^\s*(?:[-*\u2022]\s*|\d+[.)]\s*)/, '').trim())
    .filter(line => line.length >= 6 && line.length <= 80 && !/^complaint titles?:?$/i.test(line));

  return titles.length >= 3 && description.length >= 20
    ? { titles: titles.slice(0, 4), description }
    : null;
}

export class ImageRecognitionService {
  private static get ollamaUrl(): string {
    return process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/api/generate';
  }

  /**
   * Stage 1a: Query local Ollama moondream vision model with base64 image.
   */
  private static async queryVisionModel(base64Data: string, promptText: string): Promise<string | null> {
    try {
      console.log(`[ImageRecognitionService] Dispatching image (${base64Data.length} chars) to Ollama 'moondream' vision model at ${this.ollamaUrl}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout

      const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '').trim();

      const response = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'moondream',
          prompt: promptText,
          images: [cleanBase64],
          stream: false,
        }),
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const resData = (await response.json()) as { response?: string };
        const visualOutput = (resData.response || '').trim();
        if (visualOutput.length > 5) {
          console.log(`[ImageRecognitionService] Moondream vision output: "${visualOutput.substring(0, 150)}"`);
          return visualOutput;
        }
        console.warn(`[ImageRecognitionService] Moondream returned short output: "${visualOutput}"`);
      } else {
        const errText = await response.text();
        console.warn(`[ImageRecognitionService] Ollama HTTP error ${response.status}: ${errText}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ImageRecognitionService] Moondream vision unavailable (${msg}). Falling back to Gemini Vision.`);
    }
    return null;
  }

  /**
   * Stage 2a: Query local Ollama runixgov text LLM.
   */
  private static async queryRunixGov(promptText: string, maxTokens = 350): Promise<string | null> {
    try {
      console.log(`[ImageRecognitionService] Prompting Ollama 'runixgov' governance model...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for model generation

      const response = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'runixgov',
          prompt: promptText,
          stream: false,
          options: {
            temperature: 0.3,
            top_p: 0.9,
            num_predict: maxTokens,
          },
        }),
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const resData = (await response.json()) as { response?: string };
        const text = (resData.response || '').trim();
        if (text.length > 20) {
          console.log(`[ImageRecognitionService] RunixGov output received (${text.length} chars).`);
          return text;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ImageRecognitionService] RunixGov LLM unavailable (${msg}). Falling back to Gemini text.`);
    }
    return null;
  }

  /**
   * Main image analysis pipeline.
   * Cascade: Ollama moondream → Gemini Vision → keyword hint
   * Then:    RunixGov LLM → Gemini text → template fallback
   * Finally: PanIndiaDepartmentRegistry for state-wise routing
   */
  public static async analyzeImage(payload: ImageAnalysisPayload): Promise<ImageAnalysisResponse> {
    const stateCode = (payload.stateCode || '').trim().toUpperCase();
    const district = (payload.district || '').trim();
    if (!/^[A-Z]{2}$/.test(stateCode) || !district) {
      const invalid = new Error('A valid state code and district are required for image analysis.');
      Object.assign(invalid, { statusCode: 400 });
      throw invalid;
    }
    let visualDescription = '';
    let visionSource = 'none';

    // ──── STAGE 1: Visual Defect Inspection ────
    // Try Ollama moondream first (local GPU/CPU)
    if (payload.base64Data && payload.base64Data.length > 50) {
      const visionPrompt = 'Describe what you see in this photo in detail. Mention any wires, electrical equipment, poles, potholes, road damage, water leaks, garbage, or civic defects.';

      const moondreamResult = await this.queryVisionModel(payload.base64Data, visionPrompt);
      if (moondreamResult && moondreamResult.length > 10) {
        visualDescription = moondreamResult;
        visionSource = 'moondream';
      }

      // Fallback: Gemini Vision API (cloud)
      if (!visualDescription) {
        console.log('[ImageRecognitionService] Moondream unavailable — trying Gemini Vision fallback...');
        const geminiResult = await GeminiVisionProvider.analyzeImage(
          payload.base64Data,
          undefined,
          payload.mimeType,
        );
        if (geminiResult.success && geminiResult.visualDescription.length > 10) {
          visualDescription = geminiResult.visualDescription;
          visionSource = 'gemini-vision';
        }
      }
    }

    // If no vision model could analyze the image, use a generic description
    // (NOT based on filename keywords — we genuinely don't know what the image shows)
    if (!visualDescription) {
      const unavailable = new Error('Image analysis is unavailable. Configure a valid GEMINI_API_KEY with the Gemini API enabled, or run a working Ollama vision model (moondream).');
      Object.assign(unavailable, { statusCode: 503 });
      throw unavailable;
    }

    // ──── STAGE 2: Department Routing via PanIndiaDepartmentRegistry ────
    const routing = PanIndiaDepartmentRegistry.classifyAndRoute(visualDescription, stateCode);

    // ──── STAGE 3: Title & Description Synthesis via LLM ────
    const llmPrompt = `You are SamadhanAI, a Pan-India citizen grievance intelligence system.
A citizen in ${district}, ${stateCode}, India has captured evidence of the following civic issue:
"${visualDescription}"

Defect Type: ${routing.defectType}
Responsible Department: ${routing.department.departmentName}

Return four distinct, concise complaint titles (under 8 words each) and a formal grievance description explaining only the visible issue and requesting prompt department action within ${routing.department.slaHours} hours. Do not invent details that are not visible. Return exactly one JSON object with this shape: {"titles":["title 1","title 2","title 3","title 4"],"description":"formal description"}.`;

    const draftSchema = {
      type: 'OBJECT',
      properties: {
        titles: { type: 'ARRAY', items: { type: 'STRING' } },
        description: { type: 'STRING' },
      },
      required: ['titles', 'description'],
    };

    // Try RunixGov LLM first (local)
    let llmOutput = await this.queryRunixGov(llmPrompt);
    let draft = llmOutput ? parseGrievanceDraft(llmOutput) : null;

    // Gemini is the reliable fallback in hosted environments without Ollama.
    if (!draft) {
      console.log('[ImageRecognitionService] RunixGov LLM unavailable — trying Gemini text fallback...');
      const geminiText = await GeminiVisionProvider.generateText(llmPrompt, 400, draftSchema);
      if (geminiText.success && geminiText.text.length > 30) {
        llmOutput = geminiText.text;
        draft = parseGrievanceDraft(llmOutput);
      }
    }

    if (!draft) {
      const unavailable = new Error('AI text generation is unavailable. Configure Gemini API access or ensure the Ollama runixgov model is running.');
      Object.assign(unavailable, { statusCode: 503 });
      throw unavailable;
    }

    const categoryLabel = PanIndiaDepartmentRegistry.getCategoryLabel(routing.category);

    return {
      imageDescription: visualDescription,
      suggestedTitles: draft.titles,
      autoDescription: draft.description,
      detectedDefectType: routing.defectType,
      classification: {
        category: categoryLabel,
        assignedAgent: routing.department.agentId,
        agentTitle: routing.department.agentTitle,
        department: routing.department.departmentName,
        slaHours: routing.department.slaHours,
        priority: routing.priority,
        confidenceScore: null,
        provider: visionSource,
      },
    };
  }

  /**
   * Generate title suggestions for the horizontal scroll menu.
   */
  public static async suggestTitles(contextText: string): Promise<string[]> {
    if (!contextText.trim()) {
      const invalid = new Error('Complaint details are required for title suggestions.');
      Object.assign(invalid, { statusCode: 400 });
      throw invalid;
    }
    const prompt = `Generate 4 short, distinct, official grievance title suggestions (max 8 words each) for this civic complaint in India: "${contextText}". Return only the 4 titles separated by newlines.`;

    const output = await this.queryRunixGov(prompt, 120);
    if (output) {
      const titles = output.split('\n').map(l => l.replace(/^[-*•\d.]+\s*/, '').trim()).filter(l => l.length > 5 && l.length < 50);
      if (titles.length >= 3) return titles.slice(0, 4);
    }

    // Gemini fallback
    const geminiText = await GeminiVisionProvider.generateText(prompt, 150);
    if (geminiText.success) {
      const titles = geminiText.text.split('\n').map(l => l.replace(/^[-*•\d.]+\s*/, '').trim()).filter(l => l.length > 5 && l.length < 50);
      if (titles.length >= 3) return titles.slice(0, 4);
    }

    const unavailable = new Error('No AI provider returned title suggestions.');
    Object.assign(unavailable, { statusCode: 503 });
    throw unavailable;
  }

  public static async generateSuggestions(contextText: string): Promise<string[]> {
    return this.suggestTitles(contextText);
  }

  /**
   * Auto-generate formal grievance description.
   */
  public static async generateDescription(titleOrContext: string, contextOrTitle?: string, district?: string): Promise<string> {
    const title = titleOrContext.trim();
    if (!title) {
      const invalid = new Error('A grievance title is required for description generation.');
      Object.assign(invalid, { statusCode: 400 });
      throw invalid;
    }
    const contextText = contextOrTitle?.trim() || title;
    const prompt = `Write a formal citizen grievance complaint for the SamadhanAI portal (Pan-India).
Subject: ${title}
Details: ${contextText}
District: ${district || 'Not provided'}

Include citizen grievance text requesting prompt inspection and departmental action within SLA. 3-4 sentences.`;

    const output = await this.queryRunixGov(prompt, 200);
    if (output && output.length > 40) {
      return output.replace(/^["'\s]+|["'\s]+$/g, '');
    }

    // Gemini fallback
    const geminiText = await GeminiVisionProvider.generateText(prompt, 250);
    if (geminiText.success && geminiText.text.length > 40) {
      return geminiText.text.replace(/^["'\s]+|["'\s]+$/g, '');
    }

    const unavailable = new Error('No AI provider returned a grievance description.');
    Object.assign(unavailable, { statusCode: 503 });
    throw unavailable;
  }

}
