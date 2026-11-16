/**
 * AiController REST Gateway Controller
 *
 * Implements versioned endpoints:
 * POST /api/v1/ai/classify
 * POST /api/v1/ai/draft-assist
 * POST /api/v1/ai/duplicate-check
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../../../iam/api/middlewares/authMiddleware';
import { RunixGovAiProvider } from '../../infrastructure/clients/RunixGovAiProvider';
import { PromptRegistry } from '../../domain/services/PromptRegistry';
import { AiSafetyEngine } from '../../domain/services/AiSafetyEngine';
import { ImageRecognitionService } from '../../infrastructure/services/ImageRecognitionService';
import { PanIndiaDepartmentRegistry } from '../../domain/services/PanIndiaDepartmentRegistry';

const provider = new RunixGovAiProvider();
const isBoundedText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;

export class AiController {
  public static async classify(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { title, description, district, stateCode } = req.body;

    if (!isBoundedText(title, 180) || !isBoundedText(description, 4000)) {
      res.status(400).json({ code: 'InvalidInput', message: 'Provide a title and description within the allowed length.' });
      return;
    }

    const resolvedDistrict = typeof district === 'string' && district.trim() ? district.trim() : 'Central Delhi';
    const resolvedStateCode = PanIndiaDepartmentRegistry.normalizeStateCode(typeof stateCode === 'string' ? stateCode : undefined);

    const sanitizedDesc = AiSafetyEngine.sanitizeInput(description || '');
    if (AiSafetyEngine.detectInjection(sanitizedDesc)) {
      res.status(400).json({ error: 'SafetyError: Prompt injection attempt detected.' });
      return;
    }

    const prompt = PromptRegistry.getPrompt('CLASSIFY_GRIEVANCE', {
      title: title.trim(),
      description: sanitizedDesc,
      district: resolvedDistrict,
      stateCode: resolvedStateCode,
    });

    let classificationData: Record<string, unknown> | null = null;
    let metadata: Record<string, unknown> = {
      provider: 'runixgov-ai',
      timestamp: new Date().toISOString(),
    };

    try {
      const result = await provider.generateCompletion<Record<string, unknown>>(prompt);
      if (result.data && typeof result.data === 'object') {
        const raw = result.data as Record<string, unknown>;
        const categoryStr = typeof raw.category === 'string' ? raw.category : '';
        const deptStr = typeof raw.department === 'string' ? raw.department : '';
        const agentStr = typeof raw.assignedAgent === 'string' ? raw.assignedAgent : '';
        const titleStr = typeof raw.agentTitle === 'string' ? raw.agentTitle : '';
        const priorityStr = typeof raw.priority === 'string' ? raw.priority : 'High';
        const sla = typeof raw.slaHours === 'number' && raw.slaHours > 0 ? raw.slaHours : 48;

        if (categoryStr && deptStr && agentStr && titleStr) {
          classificationData = {
            category: categoryStr,
            assignedAgent: agentStr,
            agentTitle: titleStr,
            department: deptStr,
            priority: priorityStr,
            slaHours: sla,
            confidenceScore: 0.95,
          };
        } else if (categoryStr) {
          // If model returned a category (e.g. Roads) but missing specific state department fields,
          // map it through PanIndiaDepartmentRegistry for this citizen's state.
          const cat = categoryStr.toLowerCase().includes('water') ? 'water'
            : categoryStr.toLowerCase().includes('electr') ? 'electricity'
            : categoryStr.toLowerCase().includes('garb') || categoryStr.toLowerCase().includes('sanit') ? 'sanitation'
            : categoryStr.toLowerCase().includes('traff') ? 'traffic' : 'roads';
          const dept = PanIndiaDepartmentRegistry.getDepartment(resolvedStateCode, cat);
          classificationData = {
            category: PanIndiaDepartmentRegistry.getCategoryLabel(cat),
            assignedAgent: dept.agentId,
            agentTitle: dept.agentTitle,
            department: dept.departmentName,
            slaHours: dept.slaHours,
            priority: priorityStr,
            confidenceScore: 0.92,
          };
        }
        if (result.metadata) metadata = { ...result.metadata };
      }
    } catch (err) {
      console.warn(`[AiController] LLM classification unavailable (${err instanceof Error ? err.message : String(err)}). Using PanIndiaDepartmentRegistry fallback.`);
    }

    if (!classificationData) {
      const routing = PanIndiaDepartmentRegistry.classifyAndRoute(
        `${title} ${sanitizedDesc}`,
        resolvedStateCode,
      );
      classificationData = {
        category: PanIndiaDepartmentRegistry.getCategoryLabel(routing.category),
        assignedAgent: routing.department.agentId,
        agentTitle: routing.department.agentTitle,
        department: routing.department.departmentName,
        slaHours: routing.department.slaHours,
        priority: routing.priority,
        confidenceScore: 0.85,
        defectType: routing.defectType,
      };
      metadata = {
        provider: 'panindia-department-registry',
        timestamp: new Date().toISOString(),
      };
    }

    res.status(200).json({
      data: classificationData,
      metadata,
    });
  }

  public static async draftAssist(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { publicId, description } = req.body;

    if (!isBoundedText(publicId, 100) || !isBoundedText(description, 4000)) {
      res.status(400).json({ code: 'InvalidInput', message: 'Provide a valid grievance reference and description.' });
      return;
    }

    const prompt = PromptRegistry.getPrompt('DRAFT_OFFICIAL_RESPONSE', {
      publicId: publicId.trim(),
      description: description.trim(),
    });

    const result = await provider.generateCompletion<Record<string, unknown>>(prompt);
    if (typeof result.data?.summary !== 'string' || !Array.isArray(result.data.actionSteps)) {
      const unavailable = new Error('AI provider did not return a valid resolution draft.');
      Object.assign(unavailable, { statusCode: 503 });
      throw unavailable;
    }

    res.status(200).json({
      data: result.data,
      metadata: result.metadata,
    });
  }

  public static async duplicateCheck(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { targetText, candidateText } = req.body;

    if (!isBoundedText(targetText, 4000) || !isBoundedText(candidateText, 4000)) {
      res.status(400).json({ code: 'InvalidInput', message: 'Provide both text values within the allowed length.' });
      return;
    }

    const prompt = PromptRegistry.getPrompt('DUPLICATE_CHECK', {
      targetText: targetText.trim(),
      candidateText: candidateText.trim(),
    });

    const result = await provider.generateCompletion<Record<string, unknown>>(prompt);

    res.status(200).json({
      data: result.data,
      metadata: result.metadata,
    });
  }

  public static async customPrompt(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { prompt, systemPrompt, temperature, topP } = req.body;

    if (!isBoundedText(prompt, 4000) ||
        (systemPrompt !== undefined && systemPrompt !== null && !isBoundedText(systemPrompt, 1500)) ||
        (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 1)) ||
        (topP !== undefined && (typeof topP !== 'number' || topP <= 0 || topP > 1))) {
      res.status(400).json({ code: 'InvalidInput', message: 'Provide a prompt and optional settings within the allowed limits.' });
      return;
    }

    const sanitizedPrompt = AiSafetyEngine.sanitizeInput(prompt);
    if (AiSafetyEngine.detectInjection(sanitizedPrompt)) {
      res.status(400).json({ error: 'SafetyError: Potential prompt injection attempt detected.' });
      return;
    }

    const result = await provider.generateCompletion<Record<string, unknown>>(sanitizedPrompt, {
      systemPrompt: systemPrompt || undefined,
      temperature: typeof temperature === 'number' ? temperature : undefined,
      topP: typeof topP === 'number' ? topP : undefined,
    });

    res.status(200).json({
      data: result.data,
      metadata: result.metadata,
    });
  }

  public static async analyzeImage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { fileName, imagePath, mimeType, base64Data, defectHint, district, stateCode } = req.body;

    if (typeof base64Data !== 'string' || base64Data.trim().length < 50 || base64Data.length > 25_000_000) {
      res.status(400).json({ code: 'ImageRequired', message: 'Attach a valid image before running IRM.' });
      return;
    }
    const resolvedDistrict = typeof district === 'string' && district.trim() ? district.trim() : 'Central Delhi';
    const resolvedStateCode = PanIndiaDepartmentRegistry.normalizeStateCode(typeof stateCode === 'string' ? stateCode : undefined);

    const result = await ImageRecognitionService.analyzeImage({
      fileName,
      imagePath,
      mimeType,
      base64Data,
      defectHint,
      district: resolvedDistrict,
      stateCode: resolvedStateCode,
    });

    res.status(200).json({
      data: result,
      metadata: {
        engine: 'RunixGov AI Civic Vision & NLP Gateway',
        timestamp: new Date().toISOString(),
      },
    });
  }

  public static async suggestTitles(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { contextText } = req.body;
    if (contextText !== undefined && !isBoundedText(contextText, 4000)) {
      res.status(400).json({ code: 'InvalidInput', message: 'Provide text within the allowed length.' });
      return;
    }
    const titles = await ImageRecognitionService.generateSuggestions(contextText || '');
    res.status(200).json({
      data: { titles },
    });
  }

  public static async generateDescription(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { title, imageDescription } = req.body;
    if (!isBoundedText(title, 200) ||
        (imageDescription !== undefined && !isBoundedText(imageDescription, 4000))) {
      res.status(400).json({ code: 'InvalidInput', message: 'Provide a title and optional image description within the allowed length.' });
      return;
    }

    const description = await ImageRecognitionService.generateDescription(title, imageDescription);
    res.status(200).json({
      data: { description },
    });
  }
}
