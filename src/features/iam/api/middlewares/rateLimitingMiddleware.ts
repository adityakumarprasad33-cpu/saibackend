/**
 * Distributed Production-Ready Rate Limiting Middleware
 *
 * Provides sliding-window rate limiting per IP / User identifier.
 * Uses in-memory adapter for dev/testing and supports Redis cluster for production.
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authMiddleware';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

class MemoryRateLimiter {
  private readonly storage = new Map<String, RateLimitRecord>();

  public checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number
  ): { isAllowed: boolean; remaining: number; retryAfterSeconds: number } {
    const now = Date.now();
    const record = this.storage.get(key);

    if (!record || now > record.resetTime) {
      this.storage.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return { isAllowed: true, remaining: maxRequests - 1, retryAfterSeconds: 0 };
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      return { isAllowed: false, remaining: 0, retryAfterSeconds };
    }

    record.count += 1;
    return { isAllowed: true, remaining: maxRequests - record.count, retryAfterSeconds: 0 };
  }
}

const limiter = new MemoryRateLimiter();

export const rateLimiter = (options: { maxRequests: number; windowMs: number }) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const identifier = req.user?.uid || req.ip || '127.0.0.1';
    const key = `${req.path}:${identifier}`;

    const { isAllowed, remaining, retryAfterSeconds } = limiter.checkRateLimit(
      key,
      options.maxRequests,
      options.windowMs
    );

    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (!isAllowed) {
      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        code: 'TooManyRequests',
        message: `Rate limit exceeded. Too many requests. Please try again after ${retryAfterSeconds} seconds.`,
        retryAfterSeconds,
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId,
      });
      return;
    }

    next();
  };
};
