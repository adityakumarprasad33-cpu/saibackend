/**
 * Versioned AI Platform REST API Gateway Router (/api/v1/ai)
 */

import { Router } from 'express';
import { AiController } from '../controllers/AiController';
import { authMiddleware } from '../../../iam/api/middlewares/authMiddleware';
import { correlationMiddleware } from '../../../iam/api/middlewares/correlationMiddleware';
import { aiRateLimiter } from '../middlewares/aiRateLimiter';

const router = Router();

router.use(correlationMiddleware);
router.use(authMiddleware);

router.post('/classify', aiRateLimiter, AiController.classify);
router.post('/draft-assist', aiRateLimiter, AiController.draftAssist);
router.post('/duplicate-check', aiRateLimiter, AiController.duplicateCheck);
router.post('/prompt', aiRateLimiter, AiController.customPrompt);
router.post('/analyze-image', aiRateLimiter, AiController.analyzeImage);
router.post('/suggest-titles', aiRateLimiter, AiController.suggestTitles);
router.post('/generate-description', aiRateLimiter, AiController.generateDescription);

// Friendly GET info handlers for browser testing
router.get('/analyze-image', (_req, res) => {
  res.status(200).json({
    endpoint: '/api/v1/ai/analyze-image',
    method: 'POST',
    description: 'Civic image recognition, 4 title suggestions, auto-description generation, and backend department routing.',
    payloadExample: {
      fileName: 'pothole_evidence.jpg',
      defectHint: 'pothole road crack',
      district: 'Patna',
      stateCode: 'BR',
    },
  });
});

router.get('/suggest-titles', (_req, res) => {
  res.status(200).json({
    endpoint: '/api/v1/ai/suggest-titles',
    method: 'POST',
    description: 'Returns 3 to 4 high-precision civic grievance title suggestions.',
    payloadExample: {
      contextText: 'water leakage on street',
    },
  });
});

router.get('/generate-description', (_req, res) => {
  res.status(200).json({
    endpoint: '/api/v1/ai/generate-description',
    method: 'POST',
    description: 'Auto-generates official citizen grievance complaint description using RunixGov AI LLM.',
    payloadExample: {
      title: 'Drinking Water Pipe Rupture',
      imageDescription: 'Pressurized water pipe leakage on roadside',
    },
  });
});

router.get('/classify', (_req, res) => {
  res.status(200).json({
    endpoint: '/api/v1/ai/classify',
    method: 'POST',
    description: 'Classifies complaint title and description using RunixGov AI model.',
    payloadExample: {
      title: 'Pothole on Main Road',
      description: 'Severe road damage causing traffic hazards in Sector 4',
      district: 'Patna',
      stateCode: 'BR',
    },
  });
});

router.get('/draft-assist', (_req, res) => {
  res.status(200).json({
    endpoint: '/api/v1/ai/draft-assist',
    method: 'POST',
    description: 'Synthesizes nodal officer resolution draft assistance using RunixGov AI.',
    payloadExample: {
      publicId: 'SAM-BR-2026-00001042',
      description: 'Severe road damage',
    },
  });
});

router.get('/duplicate-check', (_req, res) => {
  res.status(200).json({
    endpoint: '/api/v1/ai/duplicate-check',
    method: 'POST',
    description: 'Checks similarity score between target and candidate grievance text.',
    payloadExample: {
      targetText: 'Pothole on Main Road Sector 4',
      candidateText: 'Deep road pit near Sector 4 market',
    },
  });
});

router.get('/prompt', (_req, res) => {
  res.status(200).json({
    endpoint: '/api/v1/ai/prompt',
    method: 'POST',
    description: 'Direct custom user prompting endpoint powering RunixGov AI model.',
    payloadExample: {
      prompt: 'Provide 3 key recommendations for urban road maintenance in monsoon.',
      systemPrompt: 'You are RunixGov AI, official government intelligence platform.',
      temperature: 0.2,
      topP: 0.95,
    },
  });
});

export const aiRouter = router;
