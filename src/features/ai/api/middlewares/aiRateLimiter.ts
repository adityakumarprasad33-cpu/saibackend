/**
 * Sliding Window In-Memory Rate Limiter Middleware for AI Endpoints
 * Limits requests per IP (default: max 10 requests per 60 seconds)
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  timestamps: number[];
}

const windowMs = 60 * 1000; // 1 minute window
const maxRequestsPerWindow = 10; // Max 10 requests per minute
const ipMap = new Map<string, RateLimitRecord>();

// Cleanup stale records periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipMap.entries()) {
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
    if (record.timestamps.length === 0) {
      ipMap.delete(ip);
    }
  }
}, windowMs);

export function aiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();

  let record = ipMap.get(clientIp);
  if (!record) {
    record = { timestamps: [] };
    ipMap.set(clientIp, record);
  }

  // Filter timestamps within current window
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

  if (record.timestamps.length >= maxRequestsPerWindow) {
    const oldestTimestamp = record.timestamps[0] ?? now;
    const retryAfterSec = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

    res.status(429).json({
      error: `RateLimitExceeded: Maximum ${maxRequestsPerWindow} requests per minute allowed for RunixGov AI API.`,
      retryAfterSeconds: retryAfterSec,
    });
    return;
  }

  record.timestamps.push(now);
  next();
}
