/**
 * RateGuard Express Gateway Middleware
 * Provider-independent, multi-dimensional rate limiting & abuse detection.
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../../features/iam/api/middlewares/authMiddleware';
import { RateGuardService } from '../application/RateGuardService';

export const rateGuardMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.path === '/health' || req.path === '/ready' || req.path === '/live') {
    next();
    return;
  }

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
  const deviceHeader = req.headers['x-device-signature'] as string | undefined;
  const correlationId = req.correlationId;

  const decision = await RateGuardService.getInstance().evaluateRequest(
    clientIp,
    req.path,
    req.method,
    req.user,
    deviceHeader,
    correlationId
  );

  // Set standard RFC-9457 & RateGuard telemetry headers
  res.setHeader('X-RateLimit-Limit', decision.limit);
  res.setHeader('X-RateLimit-Remaining', decision.remaining);
  res.setHeader('X-RateLimit-Policy', decision.policyName);

  if (!decision.allowed) {
    res.setHeader('Retry-After', decision.retryAfterSeconds);
    res.status(429).json({
      type: 'https://samadhanai.gov.in/problems/rate-limit-exceeded',
      title: 'Too Many Requests',
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      detail: decision.violationReason || `Rate limit exceeded for policy ${decision.policyName}. Please retry after ${decision.retryAfterSeconds} seconds.`,
      requestId: req.correlationId || `req-${Date.now()}`,
      retryAfterSeconds: decision.retryAfterSeconds,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
};
