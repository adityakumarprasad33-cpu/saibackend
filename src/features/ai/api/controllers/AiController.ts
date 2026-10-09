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

const provider = new RunixGovAiProvider();

export class AiController {
  public static async classify(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { title, description, district, stateCode } = req.body;

    if (![title, description, district, stateCode].every(value => typeof value === 'string' && value.trim())) {
      res.status(400).json({ code: 'InvalidInput', message: 'title, description, district, and stateCode are required.' });
      return;
    }

    const sanitizedDesc = AiSafetyEngine.sanitizeInput(description || '');
    if (AiSafetyEngine.detectInjection(sanitizedDesc)) {
      res.status(400).json({ error: 'SafetyError: Prompt injection attempt detected.' });
      return;
    }

    const prompt = PromptRegistry.getPrompt('CLASSIFY_GRIEVANCE', {
      title: title.trim(),
      description: sanitizedDesc,
      district: district.trim(),
      stateCode: stateCode.trim().toUpperCase(),
    });

    const result = await provider.generateCompletion<Record<string, unknown>>(prompt);
    const requiredFields = ['category', 'assignedAgent', 'agentTitle', 'department', 'priority'];
    if (!result.data || typeof result.data !== 'object' ||
        requiredFields.some(field => typeof result.data[field] !== 'string' || !String(result.data[field]).trim()) ||
        typeof result.data.slaHours !== 'number' || result.data.slaHours <= 0) {
      const unavailable = new Error('AI provider did not return a valid classification.');
      Object.assign(unavailable, { statusCode: 503 });
      throw unavailable;
    }

    res.status(200).json({
      data: result.data,
      metadata: result.metadata,
    });
  }

  public static async draftAssist(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { publicId, description } = req.body;

    if (typeof publicId !== 'string' || !publicId.trim() || typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ code: 'InvalidInput', message: 'publicId and description are required.' });
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

    if (typeof targetText !== 'string' || !targetText.trim() || typeof candidateText !== 'string' || !candidateText.trim()) {
      res.status(400).json({ code: 'InvalidInput', message: 'targetText and candidateText are required.' });
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

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      res.status(400).json({ error: 'ValidationError: "prompt" string is required.' });
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

    if (typeof base64Data !== 'string' || base64Data.trim().length < 50) {
      res.status(400).json({ code: 'ImageRequired', message: 'Attach a valid image before running IRM.' });
      return;
    }
    if (typeof district !== 'string' || !district.trim() || district.trim().length > 100) {
      res.status(400).json({ code: 'DistrictRequired', message: 'Add a valid district to your profile before running IRM.' });
      return;
    }
    if (typeof stateCode !== 'string' || !/^[A-Za-z]{2}$/.test(stateCode.trim())) {
      res.status(400).json({ code: 'StateCodeRequired', message: 'A valid two-letter state code is required for IRM routing.' });
      return;
    }

    const result = await ImageRecognitionService.analyzeImage({
      fileName,
      imagePath,
      mimeType,
      base64Data,
      defectHint,
      district,
      stateCode,
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
    const titles = await ImageRecognitionService.generateSuggestions(contextText || '');
    res.status(200).json({
      data: { titles },
    });
  }

  public static async generateDescription(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { title, imageDescription } = req.body;
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'ValidationError: "title" string is required.' });
      return;
    }

    const description = await ImageRecognitionService.generateDescription(title, imageDescription);
    res.status(200).json({
      data: { description },
    });
  }
}
