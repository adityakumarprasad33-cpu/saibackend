/**
 * RateGuard Express Gateway Middleware
 * Provider-independent, multi-dimensional rate limiting & abuse detection.
 */

import { Response, NextFunction } from 'express';
import { isIP } from 'node:net';
import { getContext } from '@netlify/functions';
import { AuthenticatedRequest } from '../../../features/iam/api/middlewares/authMiddleware';
import { RateGuardService } from '../application/RateGuardService';

export const resolveRateLimitClientIp = (
  req: Pick<AuthenticatedRequest, 'headers' | 'ip'>,
): string | null => {
  if (process.env.NODE_ENV === 'testing' && process.env.NETLIFY !== 'true') {
    const testIp = req.headers['x-test-client-ip'];
    const candidate = Array.isArray(testIp) ? testIp[0] : testIp;
    if (typeof candidate === 'string' && isIP(candidate.trim())) return candidate.trim();
  }

  if (process.env.NETLIFY === 'true') {
    try {
      const platformIp = getContext().ip;
      if (isIP(platformIp)) return platformIp;
    } catch {
      // A missing platform context must not make caller-controlled headers trusted
      // or silently merge all function callers into one IP bucket.
    }
    return null;
  }

  return req.ip && isIP(req.ip) ? req.ip : null;
};

export const rateGuardMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.path === '/health' || req.path === '/ready' || req.path === '/live') {
    next();
    return;
  }

  // Never derive client identity from request headers. Netlify's invocation
  // context provides the platform client IP; other runtimes use Express's
  // socket/proxy-derived req.ip (configure trusted proxies at the host).
  const clientIp = resolveRateLimitClientIp(req);
  if (!clientIp) {
    res.status(503).json({
      code: 'RateLimitIdentityUnavailable',
      message: 'Request identity could not be established for abuse protection.',
    });
    return;
  }
  const deviceHeader = req.headers['x-device-signature'] as string | undefined;
  const correlationId = req.correlationId;

  const rateGuard = RateGuardService.getInstance();
  const endpoint = req.originalUrl.split('?')[0] || req.path;
  const ipDecision = await rateGuard.evaluateRequest(
    clientIp,
    endpoint,
    req.method,
    undefined,
    deviceHeader,
    correlationId
  );
  const userDecision = ipDecision.allowed && req.user
    ? await rateGuard.evaluateRequest(
      clientIp,
      endpoint,
      req.method,
      req.user,
      deviceHeader,
      correlationId,
    )
    : undefined;
  const isAiRequest = /^\/api\/v1\/ai(?:\/|$)/i.test(endpoint);
  const accountAndIpAllowed = ipDecision.allowed && (userDecision?.allowed ?? true);
  const globalAiDecision = isAiRequest && accountAndIpAllowed
    ? await rateGuard.evaluateRequest(
      clientIp,
      endpoint,
      req.method,
      undefined,
      deviceHeader,
      correlationId,
      'global-ai',
    )
    : undefined;
  const decisions = [ipDecision, userDecision, globalAiDecision]
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
  const decision = decisions.reduce((lowest, current) =>
    current.remaining < lowest.remaining ? current : lowest,
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
      detail: `Please wait ${decision.retryAfterSeconds} seconds before trying again.`,
      requestId: req.correlationId || `req-${Date.now()}`,
      retryAfterSeconds: decision.retryAfterSeconds,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
};
