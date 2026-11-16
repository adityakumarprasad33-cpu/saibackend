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
  const jsonBlock = value
    .match(/\{[\s\S]*\}/)?.[0] || value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed: unknown = JSON.parse(jsonBlock);
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
  private static ollamaOfflineUntil = 0;

  private static get ollamaUrl(): string | null {
    if (Date.now() < this.ollamaOfflineUntil) return null;
    return process.env.OLLAMA_API_URL?.trim() || null;
  }

  /**
   * Stage 1a: Query local Ollama moondream vision model with base64 image.
   */
  private static async queryVisionModel(base64Data: string, promptText: string): Promise<string | null> {
    const ollamaUrl = this.ollamaUrl;
    if (!ollamaUrl) return null;
    try {
      console.log(`[ImageRecognitionService] Dispatching image (${base64Data.length} chars) to Ollama 'moondream' vision model at ${this.ollamaUrl}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '').trim();

      const response = await fetch(ollamaUrl, {
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
    const ollamaUrl = this.ollamaUrl;
    if (!ollamaUrl) return null;
    try {
      console.log(`[ImageRecognitionService] Prompting Ollama 'runixgov' governance model...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(ollamaUrl, {
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
   * Prioritizes ultra-fast single-pass Gemini multimodal civic analysis (~2s).
   * Seamlessly cascades to Ollama moondream/runixgov or rule-based PanIndiaDepartmentRegistry.
   */
  public static async analyzeImage(payload: ImageAnalysisPayload): Promise<ImageAnalysisResponse> {
    const rawState = (payload.stateCode || '').trim();
    const stateCode = PanIndiaDepartmentRegistry.normalizeStateCode(rawState);
    const district = (payload.district || '').trim() || 'Central Delhi';
    let visualDescription = '';
    let visionSource = 'none';
    let detectedCategory = 'roads';
    let detectedDefectType = 'road_infrastructure_damage';
    let draft: GeneratedGrievanceDraft | null = null;

    // ──── FAST PATH: High-speed single-call Gemini multimodal analysis ────
    if (payload.base64Data && payload.base64Data.length > 50) {
      try {
        const singlePassResult = await GeminiVisionProvider.analyzeCivicDefect(
          payload.base64Data,
          payload.mimeType,
          district,
          stateCode,
        );
        if (singlePassResult.success && singlePassResult.visualDescription.length > 10) {
          visualDescription = singlePassResult.visualDescription;
          detectedCategory = singlePassResult.defectCategory;
          detectedDefectType = singlePassResult.defectType;
          visionSource = 'gemini-vision';
          draft = {
            titles: singlePassResult.titles,
            description: singlePassResult.description,
          };
        }
      } catch (geminiErr) {
        console.warn(`[ImageRecognitionService] Fast-path Gemini multimodal error: ${geminiErr}`);
      }
    }

    // ──── CASCADE PATH: Ollama moondream / Gemini standard vision fallback ────
    if (!visualDescription && payload.base64Data && payload.base64Data.length > 50) {
      const visionPrompt = 'Describe what you see in this photo in detail. Mention any wires, electrical equipment, poles, potholes, road damage, water leaks, garbage, or civic defects.';

      // Try Ollama moondream if available
      const moondreamResult = await this.queryVisionModel(payload.base64Data, visionPrompt);
      if (moondreamResult && moondreamResult.length > 10) {
        visualDescription = moondreamResult;
        visionSource = 'moondream';
      }

      // Try Gemini standard vision
      if (!visualDescription) {
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

    // Baseline fallback if no vision model could examine the photo
    if (!visualDescription) {
      if (payload.defectHint && payload.defectHint.trim().length > 3 && !payload.defectHint.includes('image_picker')) {
        visualDescription = `Civic defect identified: ${payload.defectHint.trim()}`;
        visionSource = 'citizen-defect-hint';
      } else {
        visualDescription = `Civic infrastructure defect observed in ${district}, ${stateCode}.`;
        visionSource = 'civic-inspection-baseline';
      }
    }

    // ──── Department Routing via PanIndiaDepartmentRegistry ────
    const routing = draft && detectedCategory
      ? {
          category: detectedCategory as any,
          defectType: detectedDefectType,
          priority: 'High',
          department: PanIndiaDepartmentRegistry.getDepartment(stateCode, detectedCategory as any),
        }
      : PanIndiaDepartmentRegistry.classifyAndRoute(visualDescription, stateCode);

    // ──── Title & Description Synthesis (if not already drafted in fast path) ────
    if (!draft || draft.titles.length < 3 || draft.description.length < 20) {
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

      // Try Gemini text generation first (1-2s response)
      const geminiText = await GeminiVisionProvider.generateText(llmPrompt, 400, draftSchema);
      if (geminiText.success && geminiText.text.length > 30) {
        draft = parseGrievanceDraft(geminiText.text);
      }

      // Try Ollama runixgov as secondary fallback
      if (!draft) {
        const llmOutput = await this.queryRunixGov(llmPrompt);
        if (llmOutput) {
          draft = parseGrievanceDraft(llmOutput);
        }
      }

      // Deterministic rule-based civic draft as robust final safety net
      if (!draft) {
        const defectLabel = routing.defectType.replace(/_/g, ' ');
        const cleanDistrict = district || 'local area';
        draft = {
          titles: [
            `${routing.defectType === 'road_infrastructure_damage' ? 'Pothole & Road Damage' : defectLabel.toUpperCase()} in ${cleanDistrict}`,
            `Urgent: ${defectLabel} repair required near ${cleanDistrict}`,
            `${routing.department.departmentName} - ${defectLabel}`,
            `Civic hazard: ${defectLabel} needing prompt resolution`,
          ],
          description: `Civic infrastructure defect (${defectLabel}) reported in ${cleanDistrict}, ${stateCode}. Visual observation indicates: ${visualDescription}. Immediate departmental inspection and corrective action requested within the ${routing.department.slaHours}-hour SLA timeframe.`,
        };
      }
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
        confidenceScore: visionSource === 'gemini-vision' || visionSource === 'moondream' ? 0.95 : 0.85,
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

    // Prioritize fast Gemini cloud if available (~1s latency)
    if (process.env.GEMINI_API_KEY) {
      try {
        const geminiText = await GeminiVisionProvider.generateText(prompt, 150);
        if (geminiText.success) {
          const titles = geminiText.text.split('\n').map(l => l.replace(/^[-*•\d.]+\s*/, '').trim()).filter(l => l.length > 5 && l.length < 50);
          if (titles.length >= 3) return titles.slice(0, 4);
        }
      } catch (err) {
        console.warn('[ImageRecognitionService] Gemini suggestTitles error:', err);
      }
    }

    const output = await this.queryRunixGov(prompt, 120);
    if (output) {
      const titles = output.split('\n').map(l => l.replace(/^[-*•\d.]+\s*/, '').trim()).filter(l => l.length > 5 && l.length < 50);
      if (titles.length >= 3) return titles.slice(0, 4);
    }

    // Deterministic fallback derived from context text
    const cleanContext = contextText.trim();
    return [
      `Civic Complaint: ${cleanContext.slice(0, 40).trim()}`,
      `Urgent Maintenance Required: ${cleanContext.slice(0, 35).trim()}`,
      `Public Safety Hazard: ${cleanContext.slice(0, 35).trim()}`,
      `Request for Immediate Inspection: ${cleanContext.slice(0, 30).trim()}`,
    ];
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

    // Prioritize fast Gemini cloud if available (~1.5s latency)
    if (process.env.GEMINI_API_KEY) {
      try {
        const geminiText = await GeminiVisionProvider.generateText(prompt, 250);
        if (geminiText.success && geminiText.text.length > 40) {
          return geminiText.text.replace(/^["'\s]+|["'\s]+$/g, '');
        }
      } catch (err) {
        console.warn('[ImageRecognitionService] Gemini generateDescription error:', err);
      }
    }

    const output = await this.queryRunixGov(prompt, 200);
    if (output && output.length > 40) {
      return output.replace(/^["'\s]+|["'\s]+$/g, '');
    }

    // Deterministic formal description fallback
    return `Formal citizen grievance regarding ${title}. ${contextText}. We request the concerned municipal authority to conduct a site inspection and execute remediation within the established SLA guidelines.`;
  }

}
